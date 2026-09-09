import { status } from '@grpc/grpc-js';
import { HttpException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { grpcCode, grpcErrorCode } from '../grpc-client/grpc-error.js';
import { fail } from '../problem/problem.js';

export function attendanceFailure({
  error,
  request,
  traceId,
  regularAttendance,
  reply,
}: {
  error: unknown;
  request: FastifyRequest;
  traceId: string;
  regularAttendance?: boolean;
  reply?: FastifyReply;
}): never {
  if (error instanceof HttpException) {
    throw error;
  }
  const code = grpcCode(error);
  const backendErrorCode = grpcErrorCode(error);
  if (code === status.UNAUTHENTICATED) {
    fail(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication is required',
      request,
      traceId,
    );
  }
  if (code === status.PERMISSION_DENIED) {
    let detail = 'HRD access is required';
    if (regularAttendance) {
      detail = 'Employee access is required';
    }
    fail(403, 'FORBIDDEN', detail, request, traceId);
  }
  if (code === status.INVALID_ARGUMENT) {
    fail(
      400,
      backendErrorCode ?? 'VALIDATION_ERROR',
      'Request validation failed',
      request,
      traceId,
    );
  }
  if (code === status.NOT_FOUND) {
    fail(404, 'EVIDENCE_NOT_FOUND', 'Evidence was not found', request, traceId);
  }
  if (code === status.ALREADY_EXISTS) {
    const errorCode = backendErrorCode ?? 'ATTENDANCE_ALREADY_EXISTS';
    if (errorCode === 'REQUEST_IN_PROGRESS') {
      reply?.header('retry-after', 1);
    }
    fail(409, errorCode, 'Attendance could not be recorded', request, traceId);
  }
  if (code === status.FAILED_PRECONDITION) {
    const errorCode = backendErrorCode ?? 'EVIDENCE_INVALID';
    let httpStatus = 409;
    let detail = 'Evidence is not available';
    if (regularAttendance) {
      httpStatus = 422;
      detail = 'Attendance is not eligible';
    }
    fail(httpStatus, errorCode, detail, request, traceId);
  }
  if (code === status.DEADLINE_EXCEEDED) {
    fail(504, 'DOWNSTREAM_TIMEOUT', 'The request timed out', request, traceId);
  }
  fail(
    503,
    backendErrorCode ?? 'DEPENDENCY_UNAVAILABLE',
    'The service is temporarily unavailable',
    request,
    traceId,
  );
}
