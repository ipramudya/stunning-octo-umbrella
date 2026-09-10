import { randomUUID } from 'node:crypto';
import { STATUS_CODES } from 'node:http';

import { status as grpcStatus } from '@grpc/grpc-js';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  grpcCode,
  grpcErrorCode,
  grpcMetadata,
} from '../grpc-client/grpc-error.js';
import { clientProblemCodes } from './problem.constant.js';
import { isProblem, type Problem } from './problem.js';

const grpcHttpStatus: Partial<Record<grpcStatus, number>> = {
  [grpcStatus.INVALID_ARGUMENT]: 400,
  [grpcStatus.UNAUTHENTICATED]: 401,
  [grpcStatus.PERMISSION_DENIED]: 403,
  [grpcStatus.NOT_FOUND]: 404,
  [grpcStatus.ALREADY_EXISTS]: 409,
  [grpcStatus.ABORTED]: 409,
  [grpcStatus.FAILED_PRECONDITION]: 422,
  [grpcStatus.RESOURCE_EXHAUSTED]: 429,
  [grpcStatus.UNAVAILABLE]: 503,
  [grpcStatus.UNKNOWN]: 503,
  [grpcStatus.INTERNAL]: 503,
  [grpcStatus.DEADLINE_EXCEEDED]: 504,
};

const problemDetails: Partial<Record<string, string>> = {
  ATTENDANCE_NOT_FOUND: 'Attendance entry was not found',
  ATTENDANCE_ENTRY_NOT_FOUND: 'Attendance entry was not found',
  AUTHENTICATION_REQUIRED: 'Authentication is required',
  DEPENDENCY_UNAVAILABLE: 'The service is temporarily unavailable',
  DOWNSTREAM_TIMEOUT: 'The request timed out',
  EMPLOYEE_NOT_FOUND: 'Employee was not found',
  EVIDENCE_NOT_FOUND: 'Evidence was not found',
  FORBIDDEN: 'Access is forbidden',
  INVALID_CREDENTIALS: 'Phone number or password is incorrect',
  INVALID_CURSOR: 'The cursor is invalid',
  REQUEST_IN_PROGRESS: 'The request is already in progress',
  VALIDATION_ERROR: 'Request validation failed',
};

function grpcProblem({
  exception,
  request,
  reply,
  traceId,
}: {
  exception: unknown;
  request: FastifyRequest;
  reply: FastifyReply;
  traceId: string;
}): Problem | undefined {
  const code = grpcCode(exception);

  if (code === undefined) {
    return undefined;
  }

  const status = grpcHttpStatus[code] ?? 503;
  let problemCode = grpcErrorCode(exception);

  if (!problemCode) {
    if (status === 504) {
      problemCode = 'DOWNSTREAM_TIMEOUT';
    } else if (status >= 500) {
      problemCode = 'DEPENDENCY_UNAVAILABLE';
    } else {
      problemCode = clientProblemCodes[status] ?? 'VALIDATION_ERROR';
    }
  }

  if (problemCode === 'REQUEST_IN_PROGRESS') {
    reply.header('retry-after', grpcMetadata(exception, 'retry-after') ?? '1');
  }

  const title = STATUS_CODES[status] ?? 'Internal Server Error';

  return {
    type: 'about:blank',
    title,
    status,
    detail: problemDetails[problemCode] ?? title,
    instance: request.url,
    code: problemCode,
    traceId,
  };
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const traceId = request.id ?? randomUUID();
    let status = 500;
    let response;
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      response = exception.getResponse();
    }

    let supplied: Problem | undefined;
    if (isProblem(response)) {
      supplied = { ...response, status, instance: request.url, traceId };
    } else {
      supplied = grpcProblem({ exception, request, reply, traceId });
    }

    let problem: Problem;
    if (supplied) {
      problem = supplied;
      status = supplied.status;
    } else if (status >= 400 && status < 500) {
      const title = STATUS_CODES[status] ?? 'Bad Request';

      problem = {
        type: 'about:blank',
        title,
        status,
        detail: title,
        instance: request.url,
        code: clientProblemCodes[status] ?? 'VALIDATION_ERROR',
        traceId,
      };
    } else {
      problem = {
        type: 'about:blank',
        title: 'Internal Server Error',
        status,
        detail: 'An unexpected error occurred',
        instance: request.url,
        code: 'INTERNAL_ERROR',
        traceId,
      };
    }

    reply
      .header('x-correlation-id', traceId)
      .type('application/problem+json')
      .status(status)
      .send(problem);
  }
}
