import { status } from '@grpc/grpc-js';
import { Injectable } from '@nestjs/common';
import oracledb, { type Connection } from 'oracledb';

import { AttendanceError } from '../attendance/attendance.error.js';
import { IdempotencyService } from '../idempotency/idempotency.service.js';
import { OracleDatabase } from '../oracle.js';
import type {
  ExistingEntryRow,
  RegularAttendanceEntry,
  ZoneRow,
} from './regular-attendance.entity.js';

type RegularAttendancePersistenceErrorCode =
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'REQUEST_IN_PROGRESS';

export class RegularAttendancePersistenceError extends AttendanceError {
  constructor(code: RegularAttendancePersistenceErrorCode) {
    super(code, status.ALREADY_EXISTS);
  }
}

const operation = 'CREATE_REGULAR_ATTENDANCE';

function restoreResponse(body: string): RegularAttendanceEntry {
  // The service is the only writer of this canonical response JSON.
  // oxlint-disable-next-line typescript/no-unsafe-return
  return JSON.parse(body);
}

@Injectable()
export class RegularAttendanceRepository {
  constructor(
    private readonly database: OracleDatabase,
    private readonly idempotency: IdempotencyService,
  ) {}

  async beginAttempt({
    employeeId,
    key,
    requestHash,
    createdAt,
  }: {
    employeeId: string;
    key: string;
    requestHash: string;
    createdAt: Date;
  }): Promise<{ createdAt: Date; replay?: RegularAttendanceEntry }> {
    const claim = await this.idempotency.claim({
      actorId: employeeId,
      operation,
      key,
      hash: requestHash,
      restore: restoreResponse,
      createdAt,
    });

    if (claim.kind === 'mismatch') {
      throw new RegularAttendancePersistenceError('IDEMPOTENCY_KEY_REUSED');
    }

    if (claim.kind === 'in-progress') {
      throw new RegularAttendancePersistenceError('REQUEST_IN_PROGRESS');
    }

    if (claim.kind === 'completed') {
      return { createdAt: claim.createdAt, replay: claim.response };
    }

    return { createdAt: claim.createdAt };
  }

  existingEntries(connection: Connection, employeeId: string, workDate: Date) {
    return connection
      .execute<ExistingEntryRow>(
        `SELECT clock_type, status, occurred_at FROM attendance_entries
         WHERE employee_id = :employeeId AND work_date = :workDate
         ORDER BY CASE clock_type WHEN 'CLOCK_IN' THEN 1 ELSE 2 END`,
        { employeeId, workDate },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      )
      .then((result) => result.rows ?? []);
  }

  async zoneDistance(
    connection: Connection,
    latitude: number,
    longitude: number,
  ) {
    const result = await connection.execute<ZoneRow>(
      `SELECT active, radius_meters,
         SDO_GEOM.SDO_DISTANCE(
           center,
           MDSYS.SDO_GEOMETRY(2001, 4326,
             MDSYS.SDO_POINT_TYPE(:longitude, :latitude, NULL), NULL, NULL),
           0.005,
           'unit=METER'
         ) AS distance_meters
       FROM attendance_zones WHERE id = 1`,
      { latitude, longitude },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    const row = result.rows?.[0];

    if (!row) {
      throw new Error('attendance zone is missing');
    }

    return {
      active: row.ACTIVE === 1,
      radiusMeters: row.RADIUS_METERS,
      distanceMeters: row.DISTANCE_METERS,
    };
  }

  async record(
    connection: Connection,
    {
      entry,
      key,
      hash,
    }: { entry: RegularAttendanceEntry; key: string; hash: string },
  ) {
    await connection.execute(
      `INSERT INTO attendance_entries (
         id, employee_id, work_date, clock_type, source, status, occurred_at,
         submitted_at, address, latitude, longitude, accuracy_meters,
         distance_meters, evidence_id, updated_at
       ) VALUES (
         :id, :employeeId, :workDate, :clockType, 'REGULAR', 'RECORDED',
         :occurredAt, :submittedAt, NULL, :latitude, :longitude,
         :accuracyMeters, :distanceMeters, :evidenceId, SYSTIMESTAMP
       )`,
      {
        id: entry.id,
        employeeId: entry.employeeId,
        workDate: new Date(`${entry.workDate}T00:00:00.000Z`),
        clockType: entry.clockType,
        occurredAt: new Date(entry.occurredAt),
        submittedAt: new Date(entry.submittedAt),
        latitude: entry.location.latitude,
        longitude: entry.location.longitude,
        accuracyMeters: entry.location.accuracyMeters,
        distanceMeters: entry.location.distanceMeters,
        evidenceId: entry.evidenceId,
      },
    );
    await this.idempotency.complete(connection, {
      actorId: entry.employeeId,
      operation,
      key,
      hash,
      responseStatus: 201,
      response: entry,
    });
  }

  failAttempt(employeeId: string, key: string, hash: string) {
    return this.idempotency.release({
      actorId: employeeId,
      operation,
      key,
      hash,
    });
  }
}
