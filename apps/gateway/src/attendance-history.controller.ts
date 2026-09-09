// oxlint-disable max-params -- Nest supplies route handler dependencies separately.
import { randomUUID } from 'node:crypto';
import { STATUS_CODES } from 'node:http';

import { status, Metadata, type CallOptions } from '@grpc/grpc-js';
import type { OnModuleInit } from '@nestjs/common';
import {
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  type AttendanceEntry,
  AttendanceSource,
  AttendanceStatus,
  type Authorization,
  ClockType,
  type ListAttendanceResponse,
  TokenAudience,
} from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { firstValueFrom, fromEvent, type Observable, takeUntil } from 'rxjs';

import { cookies } from './auth.controller.js';
import { grpcCode, grpcErrorCode } from './grpc-error.js';
import {
  ATTENDANCE_HEALTH_CLIENT,
  IDENTITY_HEALTH_CLIENT,
} from './grpc-health.client.js';
import {
  attendanceEntryIdSchema,
  employeeAttendanceListSchema,
  type EmployeeAttendanceListDto,
} from './manual-decision.dto.js';
import { RateLimiter, RateLimitError } from './rate-limiter.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

type IdentityClient = {
  authorizeAccess(
    request: { audiences: TokenAudience[] },
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<Authorization>;
};

type AttendanceClient = {
  listEmployeeAttendance(
    request: { month: string },
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<ListAttendanceResponse>;
  getEmployeeAttendance(
    request: { entryId: string },
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<AttendanceEntry>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function timestampSeconds(value: unknown) {
  if (
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'bigint'
  )
    return Number(value);
  if (
    isRecord(value) &&
    typeof value.low === 'number' &&
    typeof value.high === 'number'
  )
    return value.high * 0x1_0000_0000 + (value.low >>> 0);
  throw new Error('invalid timestamp');
}

function hasTimestamp(value: unknown) {
  return (
    value instanceof Date || (isRecord(value) && value.seconds !== undefined)
  );
}

function timestamp(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (!isRecord(value)) throw new Error('invalid timestamp');
  return new Date(
    timestampSeconds(value.seconds) * 1_000 +
      Number(value.nanos ?? 0) / 1_000_000,
  ).toISOString();
}

function response(entry: AttendanceEntry) {
  return {
    id: entry.id,
    employeeId: entry.employeeId,
    workDate: entry.workDate,
    clockType:
      entry.clockType === ClockType.CLOCK_TYPE_CLOCK_IN
        ? 'CLOCK_IN'
        : 'CLOCK_OUT',
    source:
      entry.source === AttendanceSource.ATTENDANCE_SOURCE_MANUAL
        ? 'MANUAL'
        : 'REGULAR',
    status:
      entry.status === AttendanceStatus.ATTENDANCE_STATUS_PENDING_REVIEW
        ? 'PENDING_REVIEW'
        : entry.status === AttendanceStatus.ATTENDANCE_STATUS_RECORDED
          ? 'RECORDED'
          : 'REJECTED',
    occurredAt: hasTimestamp(entry.occurredAt)
      ? timestamp(entry.occurredAt)
      : null,
    claimedAt: hasTimestamp(entry.claimedAt)
      ? timestamp(entry.claimedAt)
      : null,
    submittedAt: timestamp(entry.submittedAt),
    location: entry.location,
    reason: entry.reason ?? null,
    evidenceId: entry.evidenceId ?? null,
    decision: entry.decision?.decidedByEmployeeId
      ? {
          decidedByEmployeeId: entry.decision.decidedByEmployeeId,
          decidedAt: timestamp(entry.decision.decidedAt),
          reason: entry.decision.reason || null,
        }
      : null,
  };
}

@Controller({ path: 'me/attendance', version: '1' })
export class AttendanceHistoryController implements OnModuleInit {
  private identity!: IdentityClient;
  private attendance!: AttendanceClient;

  constructor(
    @Inject(IDENTITY_HEALTH_CLIENT) private readonly identityGrpc: ClientGrpc,
    @Inject(ATTENDANCE_HEALTH_CLIENT)
    private readonly attendanceGrpc: ClientGrpc,
    private readonly rateLimiter: RateLimiter,
  ) {}

  onModuleInit() {
    this.identity =
      this.identityGrpc.getService<IdentityClient>('IdentityService');
    this.attendance =
      this.attendanceGrpc.getService<AttendanceClient>('AttendanceService');
  }

  @Get()
  async list(
    @Query(new ZodValidationPipe(employeeAttendanceListSchema))
    query: EmployeeAttendanceListDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.call(request, reply, (metadata, options) =>
      this.attendance.listEmployeeAttendance(
        { month: query.month },
        metadata,
        options,
      ),
    );
    return { items: result.items.map(response) };
  }

  @Get(':entryId')
  async get(
    @Param('entryId', new ZodValidationPipe(attendanceEntryIdSchema))
    entryId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return response(
      await this.call(request, reply, (metadata, options) =>
        this.attendance.getEmployeeAttendance({ entryId }, metadata, options),
      ),
    );
  }

  private async call<T>(
    request: FastifyRequest,
    reply: FastifyReply,
    operation: (
      metadata: Metadata,
      options: Partial<CallOptions>,
    ) => Observable<T>,
  ) {
    const traceId = randomUUID();
    reply.header('x-correlation-id', traceId);
    const metadata = new Metadata();
    metadata.set(
      'authorization',
      `Bearer ${cookies(request).dexa_access ?? ''}`,
    );
    metadata.set('x-correlation-id', traceId);
    const options = { deadline: Date.now() + 3_000 };
    const cancelled = fromEvent(request.raw, 'aborted');
    try {
      const authorization = await firstValueFrom(
        this.identity
          .authorizeAccess(
            { audiences: [TokenAudience.TOKEN_AUDIENCE_ATTENDANCE] },
            metadata,
            options,
          )
          .pipe(takeUntil(cancelled)),
      );
      await this.rateLimiter.consume({
        scope: 'authenticated',
        subject: authorization.sessionId,
        maximum: 120,
        windowSeconds: 60,
      });
      const token = authorization.tokens.find(
        (candidate) =>
          candidate.audience === TokenAudience.TOKEN_AUDIENCE_ATTENDANCE,
      )?.token;
      if (!token) throw new Error('missing attendance token');
      metadata.set('authorization', `Bearer ${token}`);
      return await firstValueFrom(
        operation(metadata, options).pipe(takeUntil(cancelled)),
      );
    } catch (error) {
      if (error instanceof RateLimitError) {
        reply.header('retry-after', error.retryAfter);
        this.fail(
          429,
          'RATE_LIMIT_EXCEEDED',
          'Too many requests',
          request,
          traceId,
        );
      }
      const grpcStatus = grpcCode(error);
      const code = grpcErrorCode(error);
      if (grpcStatus === status.UNAUTHENTICATED)
        this.fail(
          401,
          'AUTHENTICATION_REQUIRED',
          'Authentication is required',
          request,
          traceId,
        );
      if (grpcStatus === status.PERMISSION_DENIED)
        this.fail(
          403,
          'FORBIDDEN',
          'Employee access is required',
          request,
          traceId,
        );
      if (grpcStatus === status.INVALID_ARGUMENT)
        this.fail(
          400,
          code ?? 'VALIDATION_ERROR',
          'Request validation failed',
          request,
          traceId,
        );
      if (grpcStatus === status.NOT_FOUND)
        this.fail(
          404,
          'ATTENDANCE_ENTRY_NOT_FOUND',
          'Attendance entry was not found',
          request,
          traceId,
        );
      if (grpcStatus === status.DEADLINE_EXCEEDED)
        this.fail(
          504,
          'DOWNSTREAM_TIMEOUT',
          'The request timed out',
          request,
          traceId,
        );
      this.fail(
        503,
        'DEPENDENCY_UNAVAILABLE',
        'The service is temporarily unavailable',
        request,
        traceId,
      );
    }
  }

  private fail(
    statusCode: number,
    code: string,
    detail: string,
    request: FastifyRequest,
    traceId: string,
  ): never {
    throw new HttpException(
      {
        type: 'about:blank',
        title: STATUS_CODES[statusCode] ?? 'Internal Server Error',
        status: statusCode,
        detail,
        instance: request.url,
        code,
        traceId,
      },
      statusCode,
    );
  }
}
