import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  ManualAttendanceDecision,
  type DecideManualAttendanceRequest,
} from '@project/contracts';

import { ManualDecisionRepository } from './manual-decision.repository.js';

export class ManualDecisionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

type Cursor = { submittedAt: Date; id: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function decodeCursor(value: string | undefined): Cursor | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (!isRecord(parsed)) throw new Error('invalid cursor');
    const { v, endpoint, submittedAt, id } = parsed;
    if (
      v !== 1 ||
      endpoint !== 'pending-manual-attendance' ||
      typeof submittedAt !== 'string' ||
      typeof id !== 'string' ||
      Object.keys(parsed).sort().join(',') !== 'endpoint,id,submittedAt,v'
    )
      throw new Error('invalid cursor');
    const date = new Date(submittedAt);
    if (Number.isNaN(date.getTime())) throw new Error('invalid cursor');
    return { submittedAt: date, id };
  } catch {
    throw new ManualDecisionError('INVALID_CURSOR');
  }
}

function encodeCursor(value: { submittedAt?: Date; id: string }) {
  if (!value.submittedAt) throw new Error('attendance timestamp missing');
  return Buffer.from(
    JSON.stringify({
      v: 1,
      endpoint: 'pending-manual-attendance',
      submittedAt: value.submittedAt.toISOString(),
      id: value.id,
    }),
  ).toString('base64url');
}

function requestHash(request: DecideManualAttendanceRequest) {
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

@Injectable()
export class ManualDecisionService {
  constructor(private readonly repository: ManualDecisionRepository) {}

  async list(cursor: string | undefined, requestedLimit: number) {
    const limit = requestedLimit || 20;
    if (limit < 1 || limit > 100)
      throw new ManualDecisionError('VALIDATION_ERROR');
    const rows = await this.repository.list(decodeCursor(cursor), limit);
    const hasNextPage = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      ...(hasNextPage && last ? { nextCursor: encodeCursor(last) } : {}),
      hasNextPage,
    };
  }

  async get(entryId: string) {
    const value = await this.repository.get(entryId);
    if (!value) throw new ManualDecisionError('ATTENDANCE_ENTRY_NOT_FOUND');
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
    )
      throw new ManualDecisionError('VALIDATION_ERROR');
    const reason = request.reason?.trim();
    if (
      request.decision ===
      ManualAttendanceDecision.MANUAL_ATTENDANCE_DECISION_REJECT
    ) {
      if (!reason || Array.from(reason).length > 500)
        throw new ManualDecisionError('VALIDATION_ERROR');
    } else if (reason) {
      throw new ManualDecisionError('VALIDATION_ERROR');
    }

    const hash = requestHash({ ...request, reason });
    const claim = await this.repository.claim(reviewerId, key, hash);
    if (claim.kind === 'mismatch')
      throw new ManualDecisionError('IDEMPOTENCY_KEY_REUSED');
    if (claim.kind === 'in-progress')
      throw new ManualDecisionError('REQUEST_IN_PROGRESS');
    if (claim.kind === 'completed')
      return { entry: claim.response, replay: true };
    try {
      const decided = await this.repository.decide({
        reviewerId,
        entryId: request.entryId,
        decision: request.decision,
        ...(reason ? { reason } : {}),
        key,
        hash,
      });
      return { entry: decided, replay: false };
    } catch (error) {
      await this.repository.release(reviewerId, key, hash);
      const code = error instanceof Error ? error.message : '';
      if (
        [
          'ATTENDANCE_ENTRY_NOT_FOUND',
          'SELF_APPROVAL_FORBIDDEN',
          'ENTRY_NOT_PENDING_REVIEW',
          'CLOCK_IN_REQUIRED',
          'CLOCK_OUT_MUST_BE_AFTER_CLOCK_IN',
        ].includes(code)
      )
        throw new ManualDecisionError(code);
      throw error;
    }
  }
}
