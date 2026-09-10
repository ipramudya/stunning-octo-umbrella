import { createHash } from 'node:crypto';

import { status } from '@grpc/grpc-js';
import { Injectable } from '@nestjs/common';
import {
  ManualAttendanceDecision,
  type DecideManualAttendanceRequest,
} from '@project/contracts';

import { AttendanceError } from '../attendance/attendance.error.js';
import {
  ManualDecisionPersistenceError,
  ManualDecisionRepository,
} from './manual-decision.repository.js';

export type ManualDecisionErrorCode =
  | 'ATTENDANCE_ENTRY_NOT_FOUND'
  | 'CLOCK_IN_REQUIRED'
  | 'CLOCK_OUT_MUST_BE_AFTER_CLOCK_IN'
  | 'ENTRY_NOT_PENDING_REVIEW'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'REQUEST_IN_PROGRESS'
  | 'SELF_APPROVAL_FORBIDDEN'
  | 'VALIDATION_ERROR';

const manualDecisionStatus: Record<ManualDecisionErrorCode, status> = {
  ATTENDANCE_ENTRY_NOT_FOUND: status.NOT_FOUND,
  CLOCK_IN_REQUIRED: status.FAILED_PRECONDITION,
  CLOCK_OUT_MUST_BE_AFTER_CLOCK_IN: status.FAILED_PRECONDITION,
  ENTRY_NOT_PENDING_REVIEW: status.ALREADY_EXISTS,
  IDEMPOTENCY_KEY_REUSED: status.ALREADY_EXISTS,
  REQUEST_IN_PROGRESS: status.ABORTED,
  SELF_APPROVAL_FORBIDDEN: status.PERMISSION_DENIED,
  VALIDATION_ERROR: status.INVALID_ARGUMENT,
};

export class ManualDecisionError extends AttendanceError {
  constructor(code: ManualDecisionErrorCode) {
    let retryAfterSeconds;
    if (code === 'REQUEST_IN_PROGRESS') {
      retryAfterSeconds = 1;
    }

    super(code, manualDecisionStatus[code], retryAfterSeconds);
  }
}

@Injectable()
export class ManualDecisionService {
  constructor(private readonly repository: ManualDecisionRepository) {}

  async decide(
    reviewerId: string,
    key: string,
    request: DecideManualAttendanceRequest,
  ) {
    if (
      request.decision !==
        ManualAttendanceDecision.MANUAL_ATTENDANCE_DECISION_APPROVE &&
      request.decision !==
        ManualAttendanceDecision.MANUAL_ATTENDANCE_DECISION_REJECT
    ) {
      throw new ManualDecisionError('VALIDATION_ERROR');
    }

    const reason = request.reason?.trim();

    if (
      request.decision ===
      ManualAttendanceDecision.MANUAL_ATTENDANCE_DECISION_REJECT
    ) {
      if (!reason || Array.from(reason).length > 500) {
        throw new ManualDecisionError('VALIDATION_ERROR');
      }
    } else if (reason) {
      throw new ManualDecisionError('VALIDATION_ERROR');
    }

    const hash = this.requestHash({ ...request, reason });

    const claim = await this.repository.claim(reviewerId, key, hash);

    if (claim.kind === 'mismatch') {
      throw new ManualDecisionError('IDEMPOTENCY_KEY_REUSED');
    }

    if (claim.kind === 'in-progress') {
      throw new ManualDecisionError('REQUEST_IN_PROGRESS');
    }

    if (claim.kind === 'completed') {
      return { entry: claim.response, replay: true };
    }

    try {
      const decided = await this.repository.decide({
        reviewerId,
        entryId: request.entryId,
        decision: request.decision,
        reason: reason || undefined,
        key,
        hash,
      });

      return { entry: decided, replay: false };
    } catch (error) {
      await this.repository.release(reviewerId, key, hash);

      if (error instanceof ManualDecisionPersistenceError) {
        throw new ManualDecisionError(error.code);
      }

      throw error;
    }
  }

  private requestHash(request: DecideManualAttendanceRequest) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          entryId: request.entryId,
          decision: request.decision,
          reason: request.reason ?? null,
        }),
      )
      .digest('hex');
  }
}
