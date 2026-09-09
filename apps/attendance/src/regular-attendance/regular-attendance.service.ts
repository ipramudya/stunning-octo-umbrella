// oxlint-disable max-params
import { createHash, randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Connection } from 'oracledb';

import { AttendanceConflict } from '../attendance-zone/attendance-zone.repository.js';
import { AttendanceZoneRepository } from '../attendance-zone/attendance-zone.repository.js';
import type { Environment } from '../config/config-typedef.js';
import type { EvidenceUpload } from '../evidence/evidence.entity.js';
import { EvidenceError } from '../evidence/evidence.service.js';
import { EvidenceService } from '../evidence/evidence.service.js';
import type {
  ClockType,
  RegularAttendanceEntry,
} from './regular-attendance.entity.js';
import { RegularAttendanceError } from './regular-attendance.helper.js';
import { attendanceTime, jakartaTime } from './regular-attendance.helper.js';
import { RegularAttendancePersistenceError } from './regular-attendance.repository.js';
import { RegularAttendanceRepository } from './regular-attendance.repository.js';

export type RegularAttendanceRequest = {
  clockType: ClockType;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  evidenceUploadId: string;
};

@Injectable()
export class RegularAttendanceService {
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
      if (error instanceof RegularAttendancePersistenceError) {
        throw error;
      }
      throw new RegularAttendanceError('DEPENDENCY_UNAVAILABLE');
    }
    if (attempt.replay) {
      return { entry: attempt.replay, replayed: true };
    }

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
          const distanceMeters = await this.validateLocation(
            connection,
            request,
          );
          const recordedAt = attempt.createdAt.toISOString();
          const entry: RegularAttendanceEntry = {
            id: randomUUID(),
            employeeId,
            workDate: time.workDate,
            clockType: request.clockType,
            source: 'REGULAR',
            status: 'RECORDED',
            occurredAt: recordedAt,
            claimedAt: null,
            submittedAt: recordedAt,
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
          await this.attendance.record(connection, entry, idempotencyKey);
          return entry;
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
      if (error instanceof AttendanceConflict) {
        throw new RegularAttendanceError('ATTENDANCE_ALREADY_EXISTS');
      }
      if (
        error instanceof RegularAttendanceError ||
        error instanceof RegularAttendancePersistenceError ||
        error instanceof EvidenceError
      ) {
        throw error;
      }
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
    if (entries.some((entry) => entry.CLOCK_TYPE === clockType)) {
      throw new RegularAttendanceError('ATTENDANCE_ALREADY_EXISTS');
    }
    if (clockType === 'CLOCK_OUT') {
      const clockIn = entries.find(
        (entry) =>
          entry.CLOCK_TYPE === 'CLOCK_IN' && entry.STATUS === 'RECORDED',
      );
      if (!clockIn?.OCCURRED_AT) {
        throw new RegularAttendanceError('CLOCK_IN_REQUIRED');
      }
      if (clockIn.OCCURRED_AT.getTime() >= occurredAt.getTime()) {
        throw new RegularAttendanceError('CLOCK_OUT_MUST_BE_AFTER_CLOCK_IN');
      }
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
    if (!zone.active) {
      throw new RegularAttendanceError('ATTENDANCE_ZONE_INACTIVE');
    }
    if (
      request.accuracyMeters <= 0 ||
      request.accuracyMeters > this.maximumAccuracy
    ) {
      throw new RegularAttendanceError('GPS_ACCURACY_EXCEEDS_LIMIT');
    }
    if (zone.distanceMeters > zone.radiusMeters) {
      throw new RegularAttendanceError('OUTSIDE_ATTENDANCE_ZONE');
    }
    return zone.distanceMeters;
  }
}
