import { randomUUID } from 'node:crypto';
import { STATUS_CODES } from 'node:http';

import { status, Metadata, type CallOptions } from '@grpc/grpc-js';
import type { OnModuleInit } from '@nestjs/common';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ClientGrpc } from '@nestjs/microservices';
// oxlint-disable max-params
import {
  type AttendanceEntry,
  type AttendanceZone,
  type Authorization,
  type AuthorizeEvidenceAccessRequest,
  type AuthorizeEvidenceUploadRequest,
  ClockType,
  type CreateRegularAttendanceRequest,
  type EvidenceAccessAuthorization,
  type EvidenceUploadAuthorization,
  TokenAudience,
  type UpdateAttendanceZoneRequest,
} from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { firstValueFrom, fromEvent, type Observable, takeUntil } from 'rxjs';

import {
  attendanceZoneSchema,
  type AttendanceZoneDto,
} from './attendance-zone.contract.js';
import { cookies } from './auth.controller.js';
import type { Environment } from './config.schema.js';
import {
  evidenceUploadSchema,
  type EvidenceUploadDto,
} from './evidence.contract.js';
import { grpcCode, grpcErrorCode } from './grpc-error.js';
import {
  ATTENDANCE_HEALTH_CLIENT,
  IDENTITY_HEALTH_CLIENT,
} from './grpc-health.client.js';
import { RateLimiter, RateLimitError } from './rate-limiter.js';
import { regularAttendanceSchema } from './regular-attendance.contract.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

type IdentityClient = {
  authorizeAccess(
    request: { audiences: TokenAudience[] },
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<Authorization>;
};

type AttendanceClient = {
  createRegularAttendance(
    request: CreateRegularAttendanceRequest,
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<AttendanceEntry>;
  authorizeEvidenceUpload(
    request: AuthorizeEvidenceUploadRequest,
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<EvidenceUploadAuthorization>;
  authorizeEvidenceAccess(
    request: AuthorizeEvidenceAccessRequest,
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<EvidenceAccessAuthorization>;
  getAttendanceZone(
    request: object,
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<AttendanceZone>;
  updateAttendanceZone(
    request: UpdateAttendanceZoneRequest,
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<AttendanceZone>;
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
  const nanos = value.nanos;
  if (nanos !== undefined && typeof nanos !== 'number')
    throw new Error('invalid timestamp');
  return new Date(
    timestampSeconds(value.seconds) * 1_000 + (nanos ?? 0) / 1_000_000,
  ).toISOString();
}

@Controller({ version: '1' })
export class AttendanceZoneController implements OnModuleInit {
  private identity!: IdentityClient;
  private attendance!: AttendanceClient;

  constructor(
    @Inject(IDENTITY_HEALTH_CLIENT) private readonly identityGrpc: ClientGrpc,
    @Inject(ATTENDANCE_HEALTH_CLIENT)
    private readonly attendanceGrpc: ClientGrpc,
    private readonly config: ConfigService<Environment, true>,
    private readonly rateLimiter: RateLimiter,
  ) {}

  onModuleInit() {
    this.identity =
      this.identityGrpc.getService<IdentityClient>('IdentityService');
    this.attendance =
      this.attendanceGrpc.getService<AttendanceClient>('AttendanceService');
  }

  @Get('attendance-zone')
  get(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.call(request, reply);
  }

  @Post('me/evidence-uploads')
  async authorizeEvidenceUpload(
    @Body(new ZodValidationPipe(evidenceUploadSchema)) body: EvidenceUploadDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.status(201);
    return this.evidenceCall('upload', body, request, reply);
  }

  @Post('me/attendance/regular')
  async createRegularAttendance(
    @Body() untrustedBody: unknown,
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
      const idempotencyKey = request.headers['idempotency-key'];
      if (
        typeof idempotencyKey !== 'string' ||
        idempotencyKey.length < 1 ||
        idempotencyKey.length > 128
      )
        this.fail(
          400,
          'IDEMPOTENCY_KEY_REQUIRED',
          'A valid Idempotency-Key header is required',
          request,
          traceId,
        );
      const parsed = regularAttendanceSchema.safeParse(untrustedBody);
      if (!parsed.success)
        throw new HttpException(
          {
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            detail: 'Request validation failed',
            instance: request.url,
            code: 'VALIDATION_ERROR',
            traceId,
            errors: parsed.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          },
          400,
        );
      const body = parsed.data;
      metadata.set('authorization', `Bearer ${token}`);
      metadata.set('idempotency-key', idempotencyKey);
      const result = await firstValueFrom(
        this.attendance
          .createRegularAttendance(
            {
              ...body,
              clockType:
                body.clockType === 'CLOCK_IN'
                  ? ClockType.CLOCK_IN
                  : ClockType.CLOCK_OUT,
            },
            metadata,
            options,
          )
          .pipe(takeUntil(cancelled)),
      );
      if (!result.occurredAt || !result.submittedAt || !result.location)
        throw new Error('invalid regular attendance response');
      reply.status(result.replayed ? 200 : 201);
      return {
        id: result.id,
        employeeId: result.employeeId,
        workDate: result.workDate,
        clockType:
          result.clockType === ClockType.CLOCK_IN ? 'CLOCK_IN' : 'CLOCK_OUT',
        source: result.source,
        status: result.status,
        occurredAt: timestampIso(result.occurredAt),
        claimedAt: null,
        submittedAt: timestampIso(result.submittedAt),
        location: { ...result.location, address: null },
        reason: null,
        evidenceId: result.evidenceId,
        decision: null,
      };
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
      this.grpcFailure(error, request, traceId, true, reply);
    }
  }

  @Post('evidence/:evidenceId/access')
  @HttpCode(200)
  authorizeEvidenceAccess(
    @Param('evidenceId') evidenceId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.evidenceCall('access', { evidenceId }, request, reply);
  }

  @Patch('hrd/attendance-zone')
  update(
    @Body(new ZodValidationPipe(attendanceZoneSchema)) body: AttendanceZoneDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.call(request, reply, body);
  }

  private async evidenceCall(
    operation: 'upload' | 'access',
    body: EvidenceUploadDto | AuthorizeEvidenceAccessRequest,
    request: FastifyRequest,
    reply: FastifyReply,
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
      const token = authorization.tokens.find(
        (candidate) =>
          candidate.audience === TokenAudience.TOKEN_AUDIENCE_ATTENDANCE,
      )?.token;
      if (!token) throw new Error('missing attendance token');
      metadata.set('authorization', `Bearer ${token}`);
      let response: Observable<
        EvidenceUploadAuthorization | EvidenceAccessAuthorization
      >;
      if (operation === 'upload' && 'contentType' in body) {
        response = this.attendance.authorizeEvidenceUpload(
          body,
          metadata,
          options,
        );
      } else if (operation === 'access' && 'evidenceId' in body) {
        response = this.attendance.authorizeEvidenceAccess(
          body,
          metadata,
          options,
        );
      } else {
        throw new Error('invalid evidence operation');
      }
      const result = await firstValueFrom(response.pipe(takeUntil(cancelled)));
      return { ...result, expiresAt: timestampIso(result.expiresAt) };
    } catch (error) {
      this.grpcFailure(error, request, traceId);
    }
  }

  private async call(
    request: FastifyRequest,
    reply: FastifyReply,
    body?: AttendanceZoneDto,
  ) {
    const traceId = randomUUID();
    reply.header('x-correlation-id', traceId);
    if (
      body !== undefined &&
      request.headers.origin !== this.config.get('APP_ORIGIN', { infer: true })
    )
      this.fail(
        403,
        'FORBIDDEN',
        'Request origin is not allowed',
        request,
        traceId,
      );

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
      const token = authorization.tokens.find(
        (candidate) =>
          candidate.audience === TokenAudience.TOKEN_AUDIENCE_ATTENDANCE,
      )?.token;
      if (!token) throw new Error('missing attendance token');
      metadata.set('authorization', `Bearer ${token}`);
      return await firstValueFrom(
        (body
          ? this.attendance.updateAttendanceZone(body, metadata, options)
          : this.attendance.getAttendanceZone({}, metadata, options)
        ).pipe(takeUntil(cancelled)),
      );
    } catch (error) {
      this.grpcFailure(error, request, traceId);
    }
  }

  private grpcFailure(
    error: unknown,
    request: FastifyRequest,
    traceId: string,
    regularAttendance = false,
    reply?: FastifyReply,
  ): never {
    if (error instanceof HttpException) throw error;
    const code = grpcCode(error);
    const backendErrorCode = grpcErrorCode(error);
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
        regularAttendance
          ? 'Employee access is required'
          : 'HRD access is required',
        request,
        traceId,
      );
    if (code === status.INVALID_ARGUMENT)
      this.fail(
        400,
        backendErrorCode ?? 'VALIDATION_ERROR',
        'Request validation failed',
        request,
        traceId,
      );
    if (code === status.NOT_FOUND)
      this.fail(
        404,
        'EVIDENCE_NOT_FOUND',
        'Evidence was not found',
        request,
        traceId,
      );
    if (code === status.ALREADY_EXISTS) {
      const errorCode = backendErrorCode ?? 'ATTENDANCE_ALREADY_EXISTS';
      if (errorCode === 'REQUEST_IN_PROGRESS') reply?.header('retry-after', 1);
      this.fail(
        409,
        errorCode,
        'Attendance could not be recorded',
        request,
        traceId,
      );
    }
    if (code === status.FAILED_PRECONDITION) {
      const errorCode = backendErrorCode ?? 'EVIDENCE_INVALID';
      this.fail(
        regularAttendance ? 422 : 409,
        errorCode,
        regularAttendance
          ? 'Attendance is not eligible'
          : 'Evidence is not available',
        request,
        traceId,
      );
    }
    if (code === status.DEADLINE_EXCEEDED)
      this.fail(
        504,
        'DOWNSTREAM_TIMEOUT',
        'The request timed out',
        request,
        traceId,
      );
    this.fail(
      503,
      backendErrorCode ?? 'DEPENDENCY_UNAVAILABLE',
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
