import { Injectable } from '@nestjs/common';
import { AttendanceEntry, ClockType } from '@project/contracts';
import oracledb, { type Connection } from 'oracledb';

import { AttendanceZoneRepository } from './attendance-zone.js';
import {
  EvidenceRepository,
  type EvidenceUpload,
} from './evidence.repository.js';
import { OracleDatabase } from './oracle.js';

type IdempotencyRow = {
  REQUEST_HASH: string;
  STATUS: 'IN_PROGRESS' | 'COMPLETED';
  RESPONSE_BODY: string | null;
};

export type IdempotencyClaim =
  | { kind: 'new' }
  | { kind: 'mismatch' }
  | { kind: 'in-progress' }
  | { kind: 'completed'; response: AttendanceEntry };

const operation = 'CREATE_MANUAL_ATTENDANCE';

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    Reflect.get(error, 'errorNum') === 1
  );
}

function restoreResponse(body: string): AttendanceEntry {
  const value: unknown = JSON.parse(body);
  return AttendanceEntry.fromJSON(value);
}

@Injectable()
export class ManualAttendanceRepository {
  constructor(
    private readonly database: OracleDatabase,
    private readonly zones: AttendanceZoneRepository,
    private readonly evidence: EvidenceRepository,
  ) {}

  async recoverIdempotencyRecords() {
    await this.database.withTransaction(async (connection) => {
      await connection.execute(
        `DELETE FROM idempotency_records
         WHERE operation = :operation
           AND (status = 'IN_PROGRESS' OR expires_at <= SYSTIMESTAMP)`,
        { operation },
      );
    });
  }

  async claim(
    employeeId: string,
    key: string,
    hash: string,
  ): Promise<IdempotencyClaim> {
    try {
      await this.database.withTransaction(async (connection) => {
        await connection.execute(
          `DELETE FROM idempotency_records
           WHERE actor_employee_id = :employeeId AND operation = :operation
             AND idempotency_key = :key AND expires_at <= SYSTIMESTAMP`,
          { employeeId, operation, key },
        );
        await connection.execute(
          `INSERT INTO idempotency_records (
             actor_employee_id, operation, idempotency_key, request_hash,
             status, created_at, expires_at
           ) VALUES (
             :employeeId, :operation, :key, :hash, 'IN_PROGRESS',
             SYSTIMESTAMP, SYSTIMESTAMP + INTERVAL '24' HOUR
           )`,
          { employeeId, operation, key, hash },
        );
      });
      return { kind: 'new' };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const record = await this.getClaim(employeeId, key);
      if (!record) throw error;
      if (record.REQUEST_HASH !== hash) return { kind: 'mismatch' };
      if (record.STATUS === 'IN_PROGRESS') return { kind: 'in-progress' };
      if (!record.RESPONSE_BODY)
        throw new Error('idempotency response missing');
      return {
        kind: 'completed',
        response: restoreResponse(record.RESPONSE_BODY),
      };
    }
  }

  async release(employeeId: string, key: string, hash: string) {
    await this.database.withTransaction((connection) =>
      connection.execute(
        `DELETE FROM idempotency_records
         WHERE actor_employee_id = :employeeId AND operation = :operation
           AND idempotency_key = :key AND request_hash = :hash
           AND status = 'IN_PROGRESS'`,
        { employeeId, operation, key, hash },
      ),
    );
  }

  create(input: {
    employeeId: string;
    key: string;
    hash: string;
    workDate: Date;
    entry: AttendanceEntry;
    evidenceUpload: EvidenceUpload;
    permanentVersion: string;
  }) {
    const {
      employeeId,
      key,
      hash,
      workDate,
      entry,
      evidenceUpload,
      permanentVersion,
    } = input;
    return this.zones.withAttendanceMutation(
      employeeId,
      workDate,
      async (connection) => {
        const evidenceReady = await this.evidence.lockWithConnection(
          connection,
          evidenceUpload.id,
          async (_connection, current) => {
            if (
              current.employeeId !== employeeId ||
              current.status !== 'FINALIZING' ||
              current.stagingVersion !== evidenceUpload.stagingVersion
            )
              throw new Error('evidence finalization state changed');
          },
        );
        if (!evidenceReady) throw new Error('evidence upload disappeared');

        await this.insertEntry(connection, entry, workDate);
        await this.evidence.attached(
          connection,
          evidenceUpload.id,
          permanentVersion,
        );
        const completed = await connection.execute(
          `UPDATE idempotency_records
           SET status = 'COMPLETED', response_status = 201,
             response_body = :responseBody, completed_at = SYSTIMESTAMP
           WHERE actor_employee_id = :employeeId AND operation = :operation
             AND idempotency_key = :key AND request_hash = :hash
             AND status = 'IN_PROGRESS'`,
          {
            responseBody: {
              val: JSON.stringify(entry),
              type: oracledb.CLOB,
            },
            employeeId,
            operation,
            key,
            hash,
          },
        );
        if (completed.rowsAffected !== 1)
          throw new Error('idempotency claim disappeared');
        return entry;
      },
    );
  }

  private getClaim(employeeId: string, key: string) {
    return this.database.withConnection(async (connection) => {
      const result = await connection.execute<IdempotencyRow>(
        `SELECT request_hash, status,
           DBMS_LOB.SUBSTR(response_body, 32767, 1) AS response_body
         FROM idempotency_records
         WHERE actor_employee_id = :employeeId AND operation = :operation
           AND idempotency_key = :key`,
        { employeeId, operation, key },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      return result.rows?.[0];
    });
  }

  private async insertEntry(
    connection: Connection,
    entry: AttendanceEntry,
    workDate: Date,
  ) {
    await connection.execute(
      `INSERT INTO attendance_entries (
         id, employee_id, work_date, clock_type, source, status,
         claimed_at, submitted_at, address, latitude, longitude, reason,
         evidence_id, updated_at
       ) VALUES (
         :id, :employeeId, :workDate, :clockType, 'MANUAL', 'PENDING_REVIEW',
         :claimedAt, :submittedAt, :address, :latitude, :longitude, :reason,
         :evidenceId, SYSTIMESTAMP
       )`,
      {
        id: entry.id,
        employeeId: entry.employeeId,
        workDate: { val: workDate, type: oracledb.DATE },
        clockType:
          entry.clockType === ClockType.CLOCK_TYPE_CLOCK_IN
            ? 'CLOCK_IN'
            : 'CLOCK_OUT',
        claimedAt: {
          val: entry.claimedAt,
          type: oracledb.DB_TYPE_TIMESTAMP_TZ,
        },
        submittedAt: {
          val: entry.submittedAt,
          type: oracledb.DB_TYPE_TIMESTAMP_TZ,
        },
        address: entry.location?.address,
        latitude: entry.location?.latitude,
        longitude: entry.location?.longitude,
        reason: entry.reason,
        evidenceId: entry.evidenceId,
      },
    );
  }
}
