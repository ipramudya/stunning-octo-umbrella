import { Injectable } from '@nestjs/common';
import {
  AttendanceEntry,
  AttendanceSource,
  AttendanceStatus,
  ClockType,
  ManualAttendanceDecision,
} from '@project/contracts';
import oracledb, { type Connection } from 'oracledb';

import { OracleDatabase } from '../oracle.js';
import type {
  AttendanceEntryRow,
  DecisionClaim,
  IdempotencyRow,
} from './manual-decision.entity.js';

const operation = 'DECIDE_MANUAL_ATTENDANCE';

type ManualDecisionPersistenceErrorCode =
  | 'ATTENDANCE_ENTRY_NOT_FOUND'
  | 'CLOCK_IN_REQUIRED'
  | 'CLOCK_OUT_MUST_BE_AFTER_CLOCK_IN'
  | 'ENTRY_NOT_PENDING_REVIEW'
  | 'SELF_APPROVAL_FORBIDDEN';

export class ManualDecisionPersistenceError extends Error {
  constructor(readonly code: ManualDecisionPersistenceErrorCode) {
    super(code);
  }
}
export const attendanceColumns = `id, employee_id, work_date, clock_type, source, status,
  occurred_at, claimed_at, submitted_at, address, latitude, longitude,
  accuracy_meters, distance_meters, reason, evidence_id, decided_at,
  decided_by_employee_id, decision_reason`;

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    Reflect.get(error, 'errorNum') === 1
  );
}

function attendanceStatus(status: AttendanceEntryRow['STATUS']) {
  switch (status) {
    case 'PENDING_REVIEW':
      return AttendanceStatus.ATTENDANCE_STATUS_PENDING_REVIEW;
    case 'RECORDED':
      return AttendanceStatus.ATTENDANCE_STATUS_RECORDED;
    case 'REJECTED':
      return AttendanceStatus.ATTENDANCE_STATUS_REJECTED;
  }
}

export function attendanceEntry(row: AttendanceEntryRow): AttendanceEntry {
  return {
    id: row.ID,
    employeeId: row.EMPLOYEE_ID,
    workDate: row.WORK_DATE.toISOString().slice(0, 10),
    clockType:
      row.CLOCK_TYPE === 'CLOCK_IN'
        ? ClockType.CLOCK_TYPE_CLOCK_IN
        : ClockType.CLOCK_TYPE_CLOCK_OUT,
    source:
      row.SOURCE === 'MANUAL'
        ? AttendanceSource.ATTENDANCE_SOURCE_MANUAL
        : AttendanceSource.ATTENDANCE_SOURCE_REGULAR,
    status: attendanceStatus(row.STATUS),
    occurredAt: row.OCCURRED_AT || undefined,
    claimedAt: row.CLAIMED_AT || undefined,
    submittedAt: row.SUBMITTED_AT,
    location: {
      address: row.ADDRESS || undefined,
      latitude: row.LATITUDE,
      longitude: row.LONGITUDE,
      accuracyMeters: row.ACCURACY_METERS ?? undefined,
      distanceMeters: row.DISTANCE_METERS ?? undefined,
    },
    reason: row.REASON || undefined,
    evidenceId: row.EVIDENCE_ID || undefined,
    decision:
      row.DECIDED_AT && row.DECIDED_BY_EMPLOYEE_ID
        ? {
            decidedByEmployeeId: row.DECIDED_BY_EMPLOYEE_ID,
            decidedAt: row.DECIDED_AT,
            reason: row.DECISION_REASON ?? '',
          }
        : undefined,
    idempotentReplay: false,
  };
}

function restoreResponse(body: string) {
  const value: unknown = JSON.parse(body);
  return AttendanceEntry.fromJSON(value);
}

@Injectable()
export class ManualDecisionRepository {
  constructor(private readonly database: OracleDatabase) {}

  async list(
    cursor: { submittedAt: Date; id: string } | undefined,
    limit: number,
  ) {
    return this.database.withConnection(async (connection) => {
      const result = await connection.execute<AttendanceEntryRow>(
        `SELECT ${attendanceColumns} FROM attendance_entries
         WHERE source = 'MANUAL' AND status = 'PENDING_REVIEW'
           AND (:cursorAt IS NULL OR submitted_at > :cursorAt
             OR (submitted_at = :cursorAt AND id > :cursorId))
         ORDER BY submitted_at, id
         FETCH FIRST ${limit + 1} ROWS ONLY`,
        {
          cursorAt: {
            val: cursor?.submittedAt ?? null,
            type: oracledb.DB_TYPE_TIMESTAMP_TZ,
          },
          cursorId: {
            val: cursor?.id ?? null,
            type: oracledb.STRING,
            maxSize: 36,
          },
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      return (result.rows ?? []).map(attendanceEntry);
    });
  }

  get(entryId: string) {
    return this.database.withConnection((connection) =>
      this.selectEntry(connection, entryId),
    );
  }

  async claim(
    reviewerId: string,
    key: string,
    hash: string,
  ): Promise<DecisionClaim> {
    try {
      await this.database.withTransaction((connection) =>
        connection.execute(
          `INSERT INTO idempotency_records (
             actor_employee_id, operation, idempotency_key, request_hash,
             status, created_at, expires_at
           ) VALUES (
             :reviewerId, :operation, :key, :hash, 'IN_PROGRESS',
             SYSTIMESTAMP, SYSTIMESTAMP + INTERVAL '24' HOUR
           )`,
          { reviewerId, operation, key, hash },
        ),
      );
      return { kind: 'new' };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const record = await this.database.withConnection(async (connection) => {
        const result = await connection.execute<IdempotencyRow>(
          `SELECT request_hash, status,
             DBMS_LOB.SUBSTR(response_body, 32767, 1) AS response_body
           FROM idempotency_records
           WHERE actor_employee_id = :reviewerId AND operation = :operation
             AND idempotency_key = :key`,
          { reviewerId, operation, key },
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );
        return result.rows?.[0];
      });
      if (!record) {
        throw error;
      }
      if (record.REQUEST_HASH !== hash) {
        return { kind: 'mismatch' };
      }
      if (record.STATUS === 'IN_PROGRESS') {
        return { kind: 'in-progress' };
      }
      if (!record.RESPONSE_BODY) {
        throw new Error('idempotency response missing');
      }
      return {
        kind: 'completed',
        response: restoreResponse(record.RESPONSE_BODY),
      };
    }
  }

  release(reviewerId: string, key: string, hash: string) {
    return this.database.withTransaction((connection) =>
      connection.execute(
        `DELETE FROM idempotency_records
         WHERE actor_employee_id = :reviewerId AND operation = :operation
           AND idempotency_key = :key AND request_hash = :hash
           AND status = 'IN_PROGRESS'`,
        { reviewerId, operation, key, hash },
      ),
    );
  }

  decide(input: {
    reviewerId: string;
    entryId: string;
    decision: ManualAttendanceDecision;
    reason?: string;
    key: string;
    hash: string;
  }) {
    return this.database.withTransaction(async (connection) => {
      await connection.execute(
        'SELECT id FROM attendance_zones WHERE id = 1 FOR UPDATE',
      );
      const target = await this.selectEntry(connection, input.entryId);
      if (!target) {
        throw new ManualDecisionPersistenceError('ATTENDANCE_ENTRY_NOT_FOUND');
      }
      await connection.execute(
        `SELECT id FROM attendance_entries
         WHERE employee_id = :employeeId AND work_date = :workDate
         ORDER BY CASE clock_type WHEN 'CLOCK_IN' THEN 1 ELSE 2 END
         FOR UPDATE`,
        {
          employeeId: target.employeeId,
          workDate: {
            val: new Date(`${target.workDate}T00:00:00.000Z`),
            type: oracledb.DATE,
          },
        },
      );
      const locked = await this.selectEntry(connection, input.entryId);
      if (!locked) {
        throw new ManualDecisionPersistenceError('ATTENDANCE_ENTRY_NOT_FOUND');
      }
      if (locked.employeeId === input.reviewerId) {
        throw new ManualDecisionPersistenceError('SELF_APPROVAL_FORBIDDEN');
      }
      if (
        locked.source !== AttendanceSource.ATTENDANCE_SOURCE_MANUAL ||
        locked.status !== AttendanceStatus.ATTENDANCE_STATUS_PENDING_REVIEW
      ) {
        throw new ManualDecisionPersistenceError('ENTRY_NOT_PENDING_REVIEW');
      }
      if (
        input.decision ===
          ManualAttendanceDecision.MANUAL_ATTENDANCE_DECISION_APPROVE &&
        locked.clockType === ClockType.CLOCK_TYPE_CLOCK_OUT
      ) {
        await this.requireClockIn(connection, locked);
      }

      const approved =
        input.decision ===
        ManualAttendanceDecision.MANUAL_ATTENDANCE_DECISION_APPROVE;
      await connection.execute(
        `UPDATE attendance_entries
         SET status = :status, occurred_at = :occurredAt,
           decided_at = SYSTIMESTAMP, decided_by_employee_id = :reviewerId,
           decision_reason = :reason, updated_at = SYSTIMESTAMP
         WHERE id = :entryId`,
        {
          status: approved ? 'RECORDED' : 'REJECTED',
          occurredAt: {
            val: approved ? locked.claimedAt : null,
            type: oracledb.DB_TYPE_TIMESTAMP_TZ,
          },
          reviewerId: input.reviewerId,
          reason: input.reason ?? null,
          entryId: input.entryId,
        },
      );
      const updated = await this.selectEntry(connection, input.entryId);
      if (!updated) {
        throw new ManualDecisionPersistenceError('ATTENDANCE_ENTRY_NOT_FOUND');
      }
      const completed = await connection.execute(
        `UPDATE idempotency_records
         SET status = 'COMPLETED', response_status = 200,
           response_body = :responseBody, completed_at = SYSTIMESTAMP
         WHERE actor_employee_id = :reviewerId AND operation = :operation
           AND idempotency_key = :key AND request_hash = :hash
           AND status = 'IN_PROGRESS'`,
        {
          responseBody: {
            val: JSON.stringify(updated),
            type: oracledb.CLOB,
          },
          reviewerId: input.reviewerId,
          operation,
          key: input.key,
          hash: input.hash,
        },
      );
      if (completed.rowsAffected !== 1) {
        throw new Error('idempotency claim disappeared');
      }
      return updated;
    });
  }

  private async requireClockIn(
    connection: Connection,
    clockOut: AttendanceEntry,
  ) {
    const result = await connection.execute<{ OCCURRED_AT: Date }>(
      `SELECT occurred_at FROM attendance_entries
       WHERE employee_id = :employeeId AND work_date = :workDate
         AND clock_type = 'CLOCK_IN' AND status = 'RECORDED'`,
      {
        employeeId: clockOut.employeeId,
        workDate: {
          val: new Date(`${clockOut.workDate}T00:00:00.000Z`),
          type: oracledb.DATE,
        },
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const occurredAt = result.rows?.[0]?.OCCURRED_AT;
    if (!occurredAt) {
      throw new ManualDecisionPersistenceError('CLOCK_IN_REQUIRED');
    }
    if (!clockOut.claimedAt || clockOut.claimedAt <= occurredAt) {
      throw new ManualDecisionPersistenceError(
        'CLOCK_OUT_MUST_BE_AFTER_CLOCK_IN',
      );
    }
  }

  private async selectEntry(connection: Connection, entryId: string) {
    const result = await connection.execute<AttendanceEntryRow>(
      `SELECT ${attendanceColumns} FROM attendance_entries
       WHERE id = :entryId AND source = 'MANUAL'`,
      { entryId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const row = result.rows?.[0];
    return row ? attendanceEntry(row) : undefined;
  }
}
