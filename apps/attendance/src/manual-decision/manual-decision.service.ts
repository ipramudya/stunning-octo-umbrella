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
  | 'INVALID_CURSOR'
  | 'REQUEST_IN_PROGRESS'
  | 'SELF_APPROVAL_FORBIDDEN'
  | 'VALIDATION_ERROR';

const manualDecisionStatus: Record<ManualDecisionErrorCode, status> = {
  ATTENDANCE_ENTRY_NOT_FOUND: status.NOT_FOUND,
  CLOCK_IN_REQUIRED: status.FAILED_PRECONDITION,
  CLOCK_OUT_MUST_BE_AFTER_CLOCK_IN: status.FAILED_PRECONDITION,
  ENTRY_NOT_PENDING_REVIEW: status.ALREADY_EXISTS,
  IDEMPOTENCY_KEY_REUSED: status.ALREADY_EXISTS,
  INVALID_CURSOR: status.INVALID_ARGUMENT,
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

type Cursor = { submittedAt: Date; id: string };

@Injectable()
export class ManualDecisionService {
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private decodeCursor(value: string | undefined): Cursor | undefined {
    if (!value) {
      return undefined;
    }

    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      );

      if (!this.isRecord(parsed)) {
        throw new Error('invalid cursor');
      }

      const { v, endpoint, submittedAt, id } = parsed;
      const hasExpectedMetadata =
        v === 1 && endpoint === 'pending-manual-attendance';
      const hasExpectedFields =
        typeof submittedAt === 'string' && typeof id === 'string';
      const hasExpectedShape =
        Object.keys(parsed).sort().join(',') === 'endpoint,id,submittedAt,v';

      if (!hasExpectedMetadata || !hasExpectedFields || !hasExpectedShape) {
        throw new Error('invalid cursor');
      }

      const date = new Date(submittedAt);

      if (Number.isNaN(date.getTime())) {
        throw new Error('invalid cursor');
      }

      return { submittedAt: date, id };
    } catch {
      throw new ManualDecisionError('INVALID_CURSOR');
    }
  }

  private encodeCursor(value: { submittedAt?: Date; id: string }) {
    if (!value.submittedAt) {
      throw new Error('attendance timestamp missing');
    }

    return Buffer.from(
      JSON.stringify({
        v: 1,
        endpoint: 'pending-manual-attendance',
        submittedAt: value.submittedAt.toISOString(),
        id: value.id,
      }),
    ).toString('base64url');
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

  constructor(private readonly repository: ManualDecisionRepository) {}

  async list(cursor: string | undefined, requestedLimit: number) {
    const limit = requestedLimit || 20;

    if (limit < 1 || limit > 100) {
      throw new ManualDecisionError('VALIDATION_ERROR');
    }

    const rows = await this.repository.list(this.decodeCursor(cursor), limit);

    const hasNextPage = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    let nextCursor;
    if (hasNextPage && last) {
      nextCursor = this.encodeCursor(last);
    }

    return {
      items,
      nextCursor,
      hasNextPage,
    };
  }

  async get(entryId: string) {
    const value = await this.repository.get(entryId);

    if (!value) {
      throw new ManualDecisionError('ATTENDANCE_ENTRY_NOT_FOUND');
    }

    return value;
  }

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
}
