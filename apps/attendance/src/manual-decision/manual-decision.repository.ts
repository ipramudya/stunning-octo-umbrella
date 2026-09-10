import { Injectable } from '@nestjs/common';
import {
  AttendanceEntry,
  AttendanceSource,
  AttendanceStatus,
  ClockType,
  ManualAttendanceDecision,
} from '@project/contracts';
import oracledb, { type Connection } from 'oracledb';

import { IdempotencyService } from '../idempotency/idempotency.service.js';
import { OracleDatabase } from '../oracle.js';
import type { AttendanceEntryRow } from './manual-decision.entity.js';

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
  let clockType = ClockType.CLOCK_TYPE_CLOCK_OUT;
  if (row.CLOCK_TYPE === 'CLOCK_IN') {
    clockType = ClockType.CLOCK_TYPE_CLOCK_IN;
  }

  let source = AttendanceSource.ATTENDANCE_SOURCE_REGULAR;
  if (row.SOURCE === 'MANUAL') {
    source = AttendanceSource.ATTENDANCE_SOURCE_MANUAL;
  }

  let decision;
  if (row.DECIDED_AT && row.DECIDED_BY_EMPLOYEE_ID) {
    decision = {
      decidedByEmployeeId: row.DECIDED_BY_EMPLOYEE_ID,
      decidedAt: row.DECIDED_AT,
      reason: row.DECISION_REASON ?? '',
    };
  }

  return {
    id: row.ID,
    employeeId: row.EMPLOYEE_ID,
    workDate: row.WORK_DATE.toISOString().slice(0, 10),
    clockType,
    source,
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
    decision,
    idempotentReplay: false,
  };
}

function restoreResponse(body: string) {
  const value: unknown = JSON.parse(body);

  return AttendanceEntry.fromJSON(value);
}

@Injectable()
export class ManualDecisionRepository {
  constructor(
    private readonly database: OracleDatabase,
    private readonly idempotency: IdempotencyService,
  ) {}

  claim(reviewerId: string, key: string, hash: string) {
    return this.idempotency.claim({
      actorId: reviewerId,
      operation,
      key,
      hash,
      restore: restoreResponse,
    });
  }

  release(reviewerId: string, key: string, hash: string) {
    return this.idempotency.release({
      actorId: reviewerId,
      operation,
      key,
      hash,
    });
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
      let attendanceStatus = 'REJECTED';
      let occurredAt = null;
      if (approved) {
        attendanceStatus = 'RECORDED';
        occurredAt = locked.claimedAt;
      }

      await connection.execute(
        `UPDATE attendance_entries
         SET status = :status, occurred_at = :occurredAt,
           decided_at = SYSTIMESTAMP, decided_by_employee_id = :reviewerId,
           decision_reason = :reason, updated_at = SYSTIMESTAMP
         WHERE id = :entryId`,
        {
          status: attendanceStatus,
          occurredAt: {
            val: occurredAt,
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

      await this.idempotency.complete(connection, {
        actorId: input.reviewerId,
        operation,
        key: input.key,
        hash: input.hash,
        responseStatus: 200,
        response: updated,
      });

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

    if (row) {
      return attendanceEntry(row);
    }

    return undefined;
  }
}
