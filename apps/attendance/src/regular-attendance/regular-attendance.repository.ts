import { Injectable } from '@nestjs/common';
import oracledb, { type Connection } from 'oracledb';

import { OracleDatabase } from '../oracle.js';
import type {
  AttemptRow,
  ExistingEntryRow,
  RegularAttendanceEntry,
  ZoneRow,
} from './regular-attendance.entity.js';
import { RegularAttendancePersistenceError } from './regular-attendance.error.js';

const operation = 'CREATE_REGULAR_ATTENDANCE';

@Injectable()
export class RegularAttendanceRepository {
  constructor(private readonly database: OracleDatabase) {}

  async cleanupAttempts() {
    await this.database.withTransaction((connection) =>
      connection.execute(
        `DELETE FROM idempotency_records
         WHERE status = 'IN_PROGRESS' OR expires_at <= SYSTIMESTAMP`,
      ),
    );
  }

  // The compound idempotency identity stays explicit at the SQL boundary.
  // oxlint-disable-next-line max-params
  async beginAttempt(
    employeeId: string,
    key: string,
    requestHash: string,
    createdAt: Date,
  ): Promise<{ createdAt: Date; replay?: RegularAttendanceEntry }> {
    try {
      return await this.database.withTransaction(async (connection) => {
        const current = await this.attempt(connection, employeeId, key);
        if (current && current.EXPIRES_AT.getTime() > Date.now()) {
          if (current.REQUEST_HASH !== requestHash) {
            throw new RegularAttendancePersistenceError(
              'IDEMPOTENCY_KEY_REUSED',
            );
          }
          if (current.STATUS === 'IN_PROGRESS') {
            throw new RegularAttendancePersistenceError('REQUEST_IN_PROGRESS');
          }
          if (!current.RESPONSE_BODY) {
            throw new Error('missing replay response');
          }
          // The service is the only writer of this canonical response JSON.
          // oxlint-disable-next-line typescript/no-unsafe-assignment
          const replay: RegularAttendanceEntry = JSON.parse(
            current.RESPONSE_BODY,
          );
          return { createdAt: current.CREATED_AT, replay };
        }
        if (current) {
          await connection.execute(
            `DELETE FROM idempotency_records
             WHERE actor_employee_id = :employeeId AND operation = :operation
               AND idempotency_key = :key`,
            { employeeId, operation, key },
          );
        }
        await connection.execute(
          `INSERT INTO idempotency_records (
             actor_employee_id, operation, idempotency_key, request_hash,
             status, created_at, expires_at
           ) VALUES (
             :employeeId, :operation, :key, :requestHash, 'IN_PROGRESS',
             :createdAt, :expiresAt
           )`,
          {
            employeeId: { val: employeeId, type: oracledb.STRING, maxSize: 36 },
            operation,
            key: { val: key, type: oracledb.STRING, maxSize: 128 },
            requestHash,
            createdAt: { val: createdAt, type: oracledb.DB_TYPE_TIMESTAMP_TZ },
            expiresAt: {
              val: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
              type: oracledb.DB_TYPE_TIMESTAMP_TZ,
            },
          },
        );
        return { createdAt };
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        Reflect.get(error, 'errorNum') === 1
      ) {
        return this.beginAttempt(employeeId, key, requestHash, createdAt);
      }
      throw error;
    }
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
    entry: RegularAttendanceEntry,
    key: string,
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
    await connection.execute(
      `UPDATE idempotency_records
       SET status = 'COMPLETED', response_status = 201, response_body = :body,
           completed_at = SYSTIMESTAMP
       WHERE actor_employee_id = :employeeId AND operation = :operation
         AND idempotency_key = :key AND status = 'IN_PROGRESS'`,
      {
        employeeId: entry.employeeId,
        operation,
        key,
        body: JSON.stringify(entry),
      },
    );
  }

  async failAttempt(employeeId: string, key: string) {
    await this.database.withTransaction((connection) =>
      connection.execute(
        `DELETE FROM idempotency_records
         WHERE actor_employee_id = :employeeId AND operation = :operation
           AND idempotency_key = :key AND status = 'IN_PROGRESS'`,
        { employeeId, operation, key },
      ),
    );
  }

  private async attempt(
    connection: Connection,
    employeeId: string,
    key: string,
  ) {
    const result = await connection.execute<AttemptRow>(
      `SELECT request_hash, status, response_body, created_at, expires_at
       FROM idempotency_records
       WHERE actor_employee_id = :employeeId AND operation = :operation
         AND idempotency_key = :key
       FOR UPDATE`,
      { employeeId, operation, key },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: { RESPONSE_BODY: { type: oracledb.STRING } },
      },
    );
    return result.rows?.[0];
  }
}
