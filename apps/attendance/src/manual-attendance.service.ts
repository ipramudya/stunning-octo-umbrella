import { createHash, randomUUID } from 'node:crypto';

import type { OnApplicationBootstrap } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import {
  AttendanceSource,
  AttendanceStatus,
  ClockType,
  type AttendanceEntry,
  type CreateManualAttendanceRequest,
} from '@project/contracts';

import { AttendanceConflict } from './attendance-zone.js';
import type { EvidenceUpload } from './evidence.repository.js';
import { EvidenceService } from './evidence.service.js';
import { ManualAttendanceRepository } from './manual-attendance.repository.js';

const jakartaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export class ManualAttendanceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function jakartaDate(value: Date) {
  const parts = Object.fromEntries(
    jakartaDateFormatter
      .formatToParts(value)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function utcDateValue(value: string) {
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function validateManualAttendancePolicy(
  request: CreateManualAttendanceRequest,
  now: Date,
) {
  if (
    request.clockType !== ClockType.CLOCK_TYPE_CLOCK_IN &&
    request.clockType !== ClockType.CLOCK_TYPE_CLOCK_OUT
  )
    throw new ManualAttendanceError('VALIDATION_ERROR');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.workDate))
    throw new ManualAttendanceError('VALIDATION_ERROR');
  const workDateNumber = utcDateValue(request.workDate);
  if (new Date(workDateNumber).toISOString().slice(0, 10) !== request.workDate)
    throw new ManualAttendanceError('VALIDATION_ERROR');
  const today = jakartaDate(now);
  const age = (utcDateValue(today) - workDateNumber) / 86_400_000;
  if (!Number.isInteger(age) || age < 0 || age > 7)
    throw new ManualAttendanceError('MANUAL_DATE_OUT_OF_RANGE');
  if (!request.claimedAt || Number.isNaN(request.claimedAt.getTime()))
    throw new ManualAttendanceError('VALIDATION_ERROR');
  if (jakartaDate(request.claimedAt) !== request.workDate)
    throw new ManualAttendanceError('CLAIMED_AT_DATE_MISMATCH');
  if (request.claimedAt.getTime() > now.getTime())
    throw new ManualAttendanceError('FUTURE_CLAIMED_AT');
}

function requestHash(
  employeeId: string,
  request: CreateManualAttendanceRequest,
) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        employeeId,
        clockType: request.clockType,
        workDate: request.workDate,
        claimedAt: request.claimedAt?.toISOString(),
        address: request.address,
        latitude: request.latitude,
        longitude: request.longitude,
        reason: request.reason,
        evidenceUploadId: request.evidenceUploadId,
      }),
    )
    .digest('hex');
}

@Injectable()
export class ManualAttendanceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ManualAttendanceService.name);

  constructor(
    private readonly repository: ManualAttendanceRepository,
    private readonly evidence: EvidenceService,
  ) {}

  async onApplicationBootstrap() {
    await this.repository.recoverIdempotencyRecords();
  }

  async create(
    employeeId: string,
    idempotencyKey: string,
    request: CreateManualAttendanceRequest,
  ): Promise<{ entry: AttendanceEntry; replay: boolean }> {
    const now = new Date();
    validateManualAttendancePolicy(request, now);
    const hash = requestHash(employeeId, request);
    const claim = await this.repository.claim(employeeId, idempotencyKey, hash);
    if (claim.kind === 'mismatch')
      throw new ManualAttendanceError('IDEMPOTENCY_KEY_REUSED');
    if (claim.kind === 'in-progress')
      throw new ManualAttendanceError('REQUEST_IN_PROGRESS');
    if (claim.kind === 'completed')
      return { entry: claim.response, replay: true };

    let upload: EvidenceUpload | undefined;
    try {
      upload = await this.evidence.prepareStandalone(
        employeeId,
        request.evidenceUploadId,
      );
      const permanentVersion = await this.evidence.promote(upload);
      const entry: AttendanceEntry = {
        id: randomUUID(),
        employeeId,
        workDate: request.workDate,
        clockType: request.clockType,
        source: AttendanceSource.ATTENDANCE_SOURCE_MANUAL,
        status: AttendanceStatus.ATTENDANCE_STATUS_PENDING_REVIEW,
        claimedAt: request.claimedAt,
        submittedAt: now,
        location: {
          address: request.address,
          latitude: request.latitude,
          longitude: request.longitude,
        },
        reason: request.reason,
        evidenceId: request.evidenceUploadId,
        idempotentReplay: false,
      };
      const created = await this.repository.create({
        employeeId,
        key: idempotencyKey,
        hash,
        workDate: new Date(`${request.workDate}T00:00:00.000Z`),
        entry,
        evidenceUpload: upload,
        permanentVersion,
      });
      try {
        await this.evidence.complete(upload);
      } catch (error) {
        this.logger.warn(
          `staging evidence cleanup deferred for ${upload.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return { entry: created, replay: false };
    } catch (error) {
      try {
        if (upload) await this.evidence.abort(upload);
      } catch (cleanupError) {
        this.logger.warn(
          `evidence cleanup deferred: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }
      try {
        await this.repository.release(employeeId, idempotencyKey, hash);
      } catch (cleanupError) {
        this.logger.warn(
          `idempotency cleanup deferred: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }
      if (error instanceof AttendanceConflict)
        throw new ManualAttendanceError('ATTENDANCE_ALREADY_EXISTS');
      throw error;
    }
  }
}
