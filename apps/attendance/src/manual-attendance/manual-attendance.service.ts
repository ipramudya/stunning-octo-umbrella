import { createHash, randomUUID } from 'node:crypto';

import type { OnApplicationBootstrap } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import {
  AttendanceSource,
  AttendanceStatus,
  type AttendanceEntry,
  type CreateManualAttendanceRequest,
} from '@project/contracts';

import { AttendanceConflict } from '../attendance-zone/attendance-zone.repository.js';
import type { EvidenceUpload } from '../evidence/evidence.entity.js';
import { EvidenceService } from '../evidence/evidence.service.js';
import { ManualAttendanceError } from './manual-attendance.helper.js';
import { validateManualAttendancePolicy } from './manual-attendance.helper.js';
import { ManualAttendanceRepository } from './manual-attendance.repository.js';

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

@Injectable()
export class ManualAttendanceService implements OnApplicationBootstrap {
  private requestHash(
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
    const hash = this.requestHash(employeeId, request);
    const claim = await this.repository.claim(employeeId, idempotencyKey, hash);
    if (claim.kind === 'mismatch') {
      throw new ManualAttendanceError('IDEMPOTENCY_KEY_REUSED');
    }
    if (claim.kind === 'in-progress') {
      throw new ManualAttendanceError('REQUEST_IN_PROGRESS');
    }
    if (claim.kind === 'completed') {
      return { entry: claim.response, replay: true };
    }

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
          `staging evidence cleanup deferred for ${upload.id}: ${errorMessage(error)}`,
        );
      }
      return { entry: created, replay: false };
    } catch (error) {
      try {
        if (upload) {
          await this.evidence.abort(upload);
        }
      } catch (cleanupError) {
        this.logger.warn(
          `evidence cleanup deferred: ${errorMessage(cleanupError)}`,
        );
      }
      try {
        await this.repository.release(employeeId, idempotencyKey, hash);
      } catch (cleanupError) {
        this.logger.warn(
          `idempotency cleanup deferred: ${errorMessage(cleanupError)}`,
        );
      }
      if (error instanceof AttendanceConflict) {
        throw new ManualAttendanceError('ATTENDANCE_ALREADY_EXISTS');
      }
      throw error;
    }
  }
}
