// oxlint-disable max-params
import { createHash, randomUUID } from 'node:crypto';

import type { OnApplicationBootstrap } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Connection } from 'oracledb';

import {
  AttendanceConflict,
  AttendanceZoneRepository,
} from './attendance-zone.js';
import type { Environment } from './config.schema.js';
import type { EvidenceUpload } from './evidence.repository.js';
import { EvidenceError, EvidenceService } from './evidence.service.js';
import {
  type ClockType,
  type RegularAttendanceEntry,
  RegularAttendancePersistenceError,
  RegularAttendanceRepository,
} from './regular-attendance.repository.js';

export type RegularAttendanceRequest = {
  clockType: ClockType;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  evidenceUploadId: string;
};

const jakartaFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export class RegularAttendanceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function jakartaTime(now: Date) {
  const parts = Object.fromEntries(
    jakartaFormatter
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const workDate = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    workDate,
    oracleDate: new Date(`${workDate}T00:00:00.000Z`),
    seconds:
      Number(parts.hour) * 60 * 60 +
      Number(parts.minute) * 60 +
      Number(parts.second) +
      now.getUTCMilliseconds() / 1_000,
  };
}

export function attendanceTime(now: Date, clockType: ClockType) {
  const result = jakartaTime(now);
  const [start, end] =
    clockType === 'CLOCK_IN'
      ? [8 * 60 * 60, 9 * 60 * 60]
      : [17 * 60 * 60, 18 * 60 * 60];
  if (result.seconds < start || result.seconds > end)
    throw new RegularAttendanceError('ATTENDANCE_WINDOW_CLOSED');
  return result;
}

@Injectable()
export class RegularAttendanceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RegularAttendanceService.name);
  private readonly maximumAccuracy: number;

  constructor(
    private readonly zones: AttendanceZoneRepository,
    private readonly attendance: RegularAttendanceRepository,
    private readonly evidence: EvidenceService,
    config: ConfigService<Environment, true>,
  ) {
    this.maximumAccuracy = config.get('ATTENDANCE_MAX_GPS_ACCURACY_METERS', {
      infer: true,
    });
  }

  async onApplicationBootstrap() {
    await this.attendance.cleanupAttempts();
  }

  async create(
    employeeId: string,
    idempotencyKey: string,
    request: RegularAttendanceRequest,
    now = new Date(),
  ) {
    const hash = createHash('sha256')
      .update(JSON.stringify({ employeeId, ...request }))
      .digest('hex');
    let attempt;
    try {
      attempt = await this.attendance.beginAttempt(
        employeeId,
        idempotencyKey,
        hash,
        now,
      );
    } catch (error) {
      if (error instanceof RegularAttendancePersistenceError) throw error;
      throw new RegularAttendanceError('DEPENDENCY_UNAVAILABLE');
    }
    if (attempt.replay) return { entry: attempt.replay, replayed: true };

    let upload: EvidenceUpload | undefined;
    try {
      const time = jakartaTime(attempt.createdAt);
      upload = await this.zones.withAttendanceMutation(
        employeeId,
        time.oracleDate,
        async (connection) => {
          await this.validateSequence(
            connection,
            employeeId,
            request.clockType,
            time.oracleDate,
            attempt.createdAt,
          );
          attendanceTime(attempt.createdAt, request.clockType);
          const prepared = await this.evidence.prepare(
            connection,
            employeeId,
            request.evidenceUploadId,
          );
          await this.validateLocation(connection, request);
          return prepared;
        },
      );
      const permanentVersion = await this.evidence.promote(upload);
      const entry = await this.zones.withAttendanceMutation(
        employeeId,
        time.oracleDate,
        async (connection) => {
          await this.validateSequence(
            connection,
            employeeId,
            request.clockType,
            time.oracleDate,
            attempt.createdAt,
          );
          attendanceTime(attempt.createdAt, request.clockType);
          const distanceMeters = await this.validateLocation(
            connection,
            request,
          );
          const value: RegularAttendanceEntry = {
            id: randomUUID(),
            employeeId,
            workDate: time.workDate,
            clockType: request.clockType,
            source: 'REGULAR',
            status: 'RECORDED',
            occurredAt: attempt.createdAt.toISOString(),
            claimedAt: null,
            submittedAt: attempt.createdAt.toISOString(),
            location: {
              address: null,
              latitude: request.latitude,
              longitude: request.longitude,
              accuracyMeters: request.accuracyMeters,
              distanceMeters,
            },
            reason: null,
            evidenceId: request.evidenceUploadId,
            decision: null,
          };
          await this.evidence.attach(
            connection,
            request.evidenceUploadId,
            permanentVersion,
          );
          await this.attendance.record(connection, value, idempotencyKey);
          return value;
        },
      );
      this.evidence
        .cleanup(upload)
        .catch((error: unknown) =>
          this.logger.warn(
            `staging cleanup deferred for ${upload?.id}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      return { entry, replayed: false };
    } catch (error) {
      if (upload) {
        try {
          await this.evidence.abort(upload);
        } catch (cleanupError) {
          this.logger.warn(
            `evidence rollback deferred for ${upload.id}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
          );
        }
      }
      await this.attendance.failAttempt(employeeId, idempotencyKey);
      if (error instanceof AttendanceConflict)
        throw new RegularAttendanceError('ATTENDANCE_ALREADY_EXISTS');
      if (
        error instanceof RegularAttendanceError ||
        error instanceof RegularAttendancePersistenceError ||
        error instanceof EvidenceError
      )
        throw error;
      throw new RegularAttendanceError('DEPENDENCY_UNAVAILABLE');
    }
  }

  private async validateSequence(
    connection: Connection,
    employeeId: string,
    clockType: ClockType,
    workDate: Date,
    occurredAt: Date,
  ) {
    const entries = await this.attendance.existingEntries(
      connection,
      employeeId,
      workDate,
    );
    if (entries.some((entry) => entry.CLOCK_TYPE === clockType))
      throw new RegularAttendanceError('ATTENDANCE_ALREADY_EXISTS');
    if (clockType === 'CLOCK_OUT') {
      const clockIn = entries.find(
        (entry) =>
          entry.CLOCK_TYPE === 'CLOCK_IN' && entry.STATUS === 'RECORDED',
      );
      if (!clockIn?.OCCURRED_AT)
        throw new RegularAttendanceError('CLOCK_IN_REQUIRED');
      if (clockIn.OCCURRED_AT.getTime() >= occurredAt.getTime())
        throw new RegularAttendanceError('CLOCK_OUT_MUST_BE_AFTER_CLOCK_IN');
    }
  }

  private async validateLocation(
    connection: Connection,
    request: RegularAttendanceRequest,
  ) {
    const zone = await this.attendance.zoneDistance(
      connection,
      request.latitude,
      request.longitude,
    );
    if (!zone.active)
      throw new RegularAttendanceError('ATTENDANCE_ZONE_INACTIVE');
    if (
      request.accuracyMeters <= 0 ||
      request.accuracyMeters > this.maximumAccuracy
    )
      throw new RegularAttendanceError('GPS_ACCURACY_EXCEEDS_LIMIT');
    if (zone.distanceMeters > zone.radiusMeters)
      throw new RegularAttendanceError('OUTSIDE_ATTENDANCE_ZONE');
    return zone.distanceMeters;
  }
}
