import { Injectable } from '@nestjs/common';
import { AttendanceEntry, ClockType } from '@project/contracts';
import oracledb, { type Connection } from 'oracledb';

import { AttendanceZoneRepository } from '../attendance-zone/attendance-zone.repository.js';
import type { EvidenceUpload } from '../evidence/evidence.entity.js';
import { EvidenceRepository } from '../evidence/evidence.repository.js';
import { IdempotencyService } from '../idempotency/idempotency.service.js';

const operation = 'CREATE_MANUAL_ATTENDANCE';

function restoreResponse(body: string) {
  const value: unknown = JSON.parse(body);

  return AttendanceEntry.fromJSON(value);
}

@Injectable()
export class ManualAttendanceRepository {
  constructor(
    private readonly zones: AttendanceZoneRepository,
    private readonly evidence: EvidenceRepository,
    private readonly idempotency: IdempotencyService,
  ) {}

  claim(employeeId: string, key: string, hash: string) {
    return this.idempotency.claim({
      actorId: employeeId,
      operation,
      key,
      hash,
      restore: restoreResponse,
    });
  }

  release(employeeId: string, key: string, hash: string) {
    return this.idempotency.release({
      actorId: employeeId,
      operation,
      key,
      hash,
    });
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
            ) {
              throw new Error('evidence finalization state changed');
            }
          },
        );

        if (!evidenceReady) {
          throw new Error('evidence upload disappeared');
        }

        await this.insertEntry(connection, entry, workDate);
        await this.evidence.attached(
          connection,
          evidenceUpload.id,
          permanentVersion,
        );
        await this.idempotency.complete(connection, {
          actorId: employeeId,
          operation,
          key,
          hash,
          responseStatus: 201,
          response: entry,
        });

        return entry;
      },
    );
  }

  private clockType(value: ClockType) {
    if (value === ClockType.CLOCK_TYPE_CLOCK_IN) {
      return 'CLOCK_IN';
    }

    return 'CLOCK_OUT';
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
        clockType: this.clockType(entry.clockType),
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
