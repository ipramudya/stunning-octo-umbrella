// oxlint-disable max-params -- Nest supplies route handler dependencies separately.
import { randomUUID } from 'node:crypto';
import { STATUS_CODES } from 'node:http';

import { status, Metadata, type CallOptions } from '@grpc/grpc-js';
import type { OnModuleInit } from '@nestjs/common';
import {
  Body,
  Controller,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  AttendanceSource,
  AttendanceStatus,
  ClockType,
  type AttendanceEntry,
  type Authorization,
  TokenAudience,
} from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { firstValueFrom, fromEvent, type Observable, takeUntil } from 'rxjs';

import { cookies } from './auth.controller.js';
import type { Environment } from './config.schema.js';
import { grpcCode, grpcErrorCode, grpcMetadata } from './grpc-error.js';
import {
  ATTENDANCE_HEALTH_CLIENT,
  IDENTITY_HEALTH_CLIENT,
} from './grpc-health.client.js';
import {
  manualAttendanceRequest,
  manualAttendanceSchema,
  type ManualAttendanceDto,
  type ManualAttendanceRpcRequest,
} from './manual-attendance.contract.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

type IdentityClient = {
  authorizeAccess(
    request: { audiences: TokenAudience[] },
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<Authorization>;
};

type AttendanceClient = {
  createManualAttendance(
    request: ManualAttendanceRpcRequest,
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

function timestampIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (!isRecord(value)) throw new Error('invalid timestamp');
  return new Date(
    timestampSeconds(value.seconds) * 1_000 +
      Number(value.nanos ?? 0) / 1_000_000,
  ).toISOString();
}

function attendanceStatus(status: AttendanceStatus) {
  if (status === AttendanceStatus.ATTENDANCE_STATUS_PENDING_REVIEW)
    return 'PENDING_REVIEW';
  if (status === AttendanceStatus.ATTENDANCE_STATUS_RECORDED) return 'RECORDED';
  return 'REJECTED';
}

function attendanceResponse(entry: AttendanceEntry) {
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
    status: attendanceStatus(entry.status),
    occurredAt: entry.occurredAt ? timestampIso(entry.occurredAt) : null,
    claimedAt: entry.claimedAt ? timestampIso(entry.claimedAt) : null,
    submittedAt: timestampIso(entry.submittedAt),
    location: {
      address: entry.location?.address ?? null,
      latitude: entry.location?.latitude ?? null,
      longitude: entry.location?.longitude ?? null,
      accuracyMeters: entry.location?.accuracyMeters ?? null,
      distanceMeters: entry.location?.distanceMeters ?? null,
    },
    reason: entry.reason ?? null,
    evidenceId: entry.evidenceId ?? null,
    decision: entry.decision ?? null,
  };
}

@Controller({ version: '1' })
export class ManualAttendanceController implements OnModuleInit {
  private identity!: IdentityClient;
  private attendance!: AttendanceClient;

  constructor(
    @Inject(IDENTITY_HEALTH_CLIENT) private readonly identityGrpc: ClientGrpc,
    @Inject(ATTENDANCE_HEALTH_CLIENT)
    private readonly attendanceGrpc: ClientGrpc,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  onModuleInit() {
    this.identity =
      this.identityGrpc.getService<IdentityClient>('IdentityService');
    this.attendance =
      this.attendanceGrpc.getService<AttendanceClient>('AttendanceService');
  }

  @Post('me/attendance/manual')
  async create(
    @Body(new ZodValidationPipe(manualAttendanceSchema))
    body: ManualAttendanceDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const traceId = randomUUID();
    reply.header('x-correlation-id', traceId);
    if (
      request.headers.origin !== this.config.get('APP_ORIGIN', { infer: true })
    )
      this.fail(
        403,
        'FORBIDDEN',
        'Request origin is not allowed',
        request,
        traceId,
      );
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 1 || key.length > 128)
      this.fail(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key is required',
        request,
        traceId,
      );

    const metadata = new Metadata();
    metadata.set(
      'authorization',
      `Bearer ${cookies(request).dexa_access ?? ''}`,
    );
    metadata.set('x-correlation-id', traceId);
    metadata.set('idempotency-key', key);
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
      const token = authorization.tokens.find(
        (candidate) =>
          candidate.audience === TokenAudience.TOKEN_AUDIENCE_ATTENDANCE,
      )?.token;
      if (!token) throw new Error('missing attendance token');
      metadata.set('authorization', `Bearer ${token}`);
      const entry = await firstValueFrom(
        this.attendance
          .createManualAttendance(
            manualAttendanceRequest(body),
            metadata,
            options,
          )
          .pipe(takeUntil(cancelled)),
      );
      reply.status(entry.idempotentReplay ? 200 : 201);
      return attendanceResponse(entry);
    } catch (error) {
      this.grpcFailure(error, request, reply, traceId);
    }
  }

  private grpcFailure(
    error: unknown,
    request: FastifyRequest,
    reply: FastifyReply,
    traceId: string,
  ): never {
    if (error instanceof HttpException) throw error;
    const code = grpcCode(error);
    const errorCode = grpcErrorCode(error);
    if (code === status.UNAUTHENTICATED)
      this.fail(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication is required',
        request,
        traceId,
      );
    if (code === status.PERMISSION_DENIED)
      this.fail(
        403,
        'FORBIDDEN',
        'Employee access is required',
        request,
        traceId,
      );
    if (code === status.INVALID_ARGUMENT)
      this.fail(
        400,
        errorCode ?? 'VALIDATION_ERROR',
        'Request validation failed',
        request,
        traceId,
      );
    if (code === status.NOT_FOUND)
      this.fail(
        404,
        errorCode ?? 'EVIDENCE_NOT_FOUND',
        'Evidence was not found',
        request,
        traceId,
      );
    if (code === status.ALREADY_EXISTS)
      this.fail(
        409,
        errorCode ?? 'ATTENDANCE_ALREADY_EXISTS',
        'The request conflicts with existing data',
        request,
        traceId,
      );
    if (code === status.ABORTED) {
      reply.header('retry-after', grpcMetadata(error, 'retry-after') ?? '1');
      this.fail(
        409,
        errorCode ?? 'REQUEST_IN_PROGRESS',
        'The request is already in progress',
        request,
        traceId,
      );
    }
    if (code === status.FAILED_PRECONDITION)
      this.fail(
        422,
        errorCode ?? 'EVIDENCE_INVALID',
        'The request cannot be processed',
        request,
        traceId,
      );
    if (code === status.DEADLINE_EXCEEDED)
      this.fail(
        504,
        'DOWNSTREAM_TIMEOUT',
        'The request timed out',
        request,
        traceId,
      );
    if (
      code === status.UNAVAILABLE &&
      errorCode === 'EVIDENCE_FINALIZATION_FAILED'
    )
      this.fail(
        503,
        errorCode,
        'Evidence finalization failed',
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
