import { status, Metadata } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';

import { AttendanceQueryError } from '../attendance-query/attendance-query.service.js';
import { EvidenceError } from '../evidence/evidence.service.js';
import { ManualDecisionError } from '../manual-decision/manual-decision.service.js';
import { RegularAttendanceError } from '../regular-attendance/regular-attendance.helper.js';

export function failure(
  code: number,
  detail: string,
  retryAfter?: number,
): never {
  const metadata = new Metadata();
  metadata.set('x-error-code', detail);
  if (retryAfter !== undefined) {
    metadata.set('retry-after', String(retryAfter));
  }
  throw new RpcException({ code, details: detail, metadata });
}

export function queryFailure(error: unknown): never {
  if (error instanceof AttendanceQueryError) {
    failure(error.grpcStatus, error.code);
  }
  throw error;
}

function evidenceStatus(code: string) {
  if (code === 'EVIDENCE_ALREADY_ATTACHED') {
    return status.ALREADY_EXISTS;
  }
  if (code === 'EVIDENCE_FINALIZATION_FAILED') {
    return status.UNAVAILABLE;
  }
  return status.FAILED_PRECONDITION;
}

export function evidenceFailure(error: unknown): never {
  if (!(error instanceof EvidenceError)) {
    throw error;
  }
  const code =
    error.code === 'EVIDENCE_NOT_FOUND'
      ? status.NOT_FOUND
      : evidenceStatus(error.code);
  failure(code, error.code);
}

export function manualDecisionFailure(error: unknown): never {
  if (!(error instanceof ManualDecisionError)) {
    throw error;
  }
  switch (error.code) {
    case 'VALIDATION_ERROR':
    case 'INVALID_CURSOR':
      failure(status.INVALID_ARGUMENT, error.code);
    case 'ATTENDANCE_ENTRY_NOT_FOUND':
      failure(status.NOT_FOUND, error.code);
    case 'SELF_APPROVAL_FORBIDDEN':
      failure(status.PERMISSION_DENIED, error.code);
    case 'IDEMPOTENCY_KEY_REUSED':
    case 'ENTRY_NOT_PENDING_REVIEW':
      failure(status.ALREADY_EXISTS, error.code);
    case 'REQUEST_IN_PROGRESS':
      failure(status.ABORTED, error.code, 1);
    case 'CLOCK_IN_REQUIRED':
    case 'CLOCK_OUT_MUST_BE_AFTER_CLOCK_IN':
      failure(status.FAILED_PRECONDITION, error.code);
    default:
      throw error;
  }
}

export function regularFailure(error: unknown): never {
  const code = error instanceof Error ? error.message : '';
  switch (code) {
    case 'EVIDENCE_NOT_FOUND':
      failure(status.NOT_FOUND, code);
    case 'ATTENDANCE_ALREADY_EXISTS':
    case 'IDEMPOTENCY_KEY_REUSED':
    case 'REQUEST_IN_PROGRESS':
      failure(status.ALREADY_EXISTS, code);
    case 'DEPENDENCY_UNAVAILABLE':
    case 'EVIDENCE_FINALIZATION_FAILED':
      failure(status.UNAVAILABLE, code);
    default:
      if (
        error instanceof RegularAttendanceError ||
        error instanceof EvidenceError
      ) {
        failure(status.FAILED_PRECONDITION, code);
      }
      throw error;
  }
}
