// oxlint-disable max-params -- Nest supplies route handler dependencies separately.
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
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  type AttendanceEntry,
  AttendanceSource,
  AttendanceStatus,
  type Authorization,
  ClockType,
  type EmployeeProfile,
  type ListPendingManualAttendanceResponse,
  ManualAttendanceDecision,
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
  attendanceEntryIdSchema,
  pendingManualListSchema,
  type PendingManualListDto,
  rejectManualAttendanceSchema,
  type RejectManualAttendanceDto,
} from './manual-decision.contract.js';
import { RateLimiter, RateLimitError } from './rate-limiter.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

type IdentityClient = {
  authorizeAccess(
    request: { audiences: TokenAudience[] },
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<Authorization>;
  getEmployee(
    request: { employeeId: string },
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<EmployeeProfile>;
};

type AttendanceClient = {
  listPendingManualAttendance(
    request: { cursor?: string; limit: number },
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<ListPendingManualAttendanceResponse>;
  getManualAttendance(
    request: { entryId: string },
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<AttendanceEntry>;
  decideManualAttendance(
    request: {
      entryId: string;
      decision: ManualAttendanceDecision;
      reason?: string;
    },
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<AttendanceEntry>;
};

type CallContext = {
  attendance: Metadata;
  identity: Metadata;
  options: Partial<CallOptions>;
  cancelled: Observable<unknown>;
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

function requireProfile(
  profiles: Map<string, EmployeeProfile>,
  employeeId: string,
) {
  const profile = profiles.get(employeeId);
  if (!profile) throw new Error(`employee profile missing: ${employeeId}`);
  return profile;
}

function person(value: EmployeeProfile) {
  return {
    id: value.id,
    employeeNumber: value.employeeNumber,
    fullName: value.fullName,
  };
}

function entryResponse(
  entry: AttendanceEntry,
  employee: EmployeeProfile,
  reviewer?: EmployeeProfile,
) {
  return {
    id: entry.id,
    employeeId: entry.employeeId,
    employee: person(employee),
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
    decision:
      entry.decision && reviewer
        ? {
            decidedAt: timestampIso(entry.decision.decidedAt),
            reviewer: person(reviewer),
            reason: entry.decision.reason || null,
          }
        : null,
  };
}

@Controller({ path: 'hrd/attendance', version: '1' })
export class ManualDecisionController implements OnModuleInit {
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

  @Get()
  async list(
    @Query(new ZodValidationPipe(pendingManualListSchema))
    query: PendingManualListDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.call(request, reply, false, async (context) => {
      const result = await firstValueFrom(
        this.attendance
          .listPendingManualAttendance(
            { cursor: query.cursor, limit: query.limit },
            context.attendance,
            context.options,
          )
          .pipe(takeUntil(context.cancelled)),
      );
      const profiles = await this.profiles(
        result.items.map((entry) => entry.employeeId),
        context,
      );
      return {
        items: result.items.map((entry) =>
          entryResponse(entry, requireProfile(profiles, entry.employeeId)),
        ),
        pageInfo: {
          ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
          hasNextPage: result.hasNextPage,
        },
      };
    });
  }

  @Get(':entryId')
  async get(
    @Param('entryId', new ZodValidationPipe(attendanceEntryIdSchema))
    entryId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.call(request, reply, false, async (context) => {
      const entry = await this.getEntry(entryId, context);
      const ids = [entry.employeeId];
      if (entry.decision?.decidedByEmployeeId)
        ids.push(entry.decision.decidedByEmployeeId);
      const profiles = await this.profiles(ids, context);
      return entryResponse(
        entry,
        requireProfile(profiles, entry.employeeId),
        entry.decision?.decidedByEmployeeId
          ? profiles.get(entry.decision.decidedByEmployeeId)
          : undefined,
      );
    });
  }

  @Post(':entryId/approve')
  @HttpCode(200)
  approve(
    @Param('entryId', new ZodValidationPipe(attendanceEntryIdSchema))
    entryId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.decision(
      entryId,
      ManualAttendanceDecision.MANUAL_ATTENDANCE_DECISION_APPROVE,
      undefined,
      request,
      reply,
    );
  }

  @Post(':entryId/reject')
  @HttpCode(200)
  reject(
    @Param('entryId', new ZodValidationPipe(attendanceEntryIdSchema))
    entryId: string,
    @Body(new ZodValidationPipe(rejectManualAttendanceSchema))
    body: RejectManualAttendanceDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.decision(
      entryId,
      ManualAttendanceDecision.MANUAL_ATTENDANCE_DECISION_REJECT,
      body.reason,
      request,
      reply,
    );
  }

  private decision(
    entryId: string,
    decision: ManualAttendanceDecision,
    reason: string | undefined,
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    return this.call(request, reply, true, async (context) => {
      const result = await firstValueFrom(
        this.attendance
          .decideManualAttendance(
            { entryId, decision, reason },
            context.attendance,
            context.options,
          )
          .pipe(takeUntil(context.cancelled)),
      );
      const profiles = await this.profiles(
        [result.employeeId, result.decision?.decidedByEmployeeId ?? ''],
        context,
      );
      const reviewerId = result.decision?.decidedByEmployeeId;
      return entryResponse(
        result,
        requireProfile(profiles, result.employeeId),
        reviewerId ? profiles.get(reviewerId) : undefined,
      );
    });
  }

  private getEntry(entryId: string, context: CallContext) {
    return firstValueFrom(
      this.attendance
        .getManualAttendance({ entryId }, context.attendance, context.options)
        .pipe(takeUntil(context.cancelled)),
    );
  }

  private async profiles(employeeIds: string[], context: CallContext) {
    const profiles = await Promise.all(
      [...new Set(employeeIds.filter(Boolean))].map((employeeId) =>
        firstValueFrom(
          this.identity
            .getEmployee({ employeeId }, context.identity, context.options)
            .pipe(takeUntil(context.cancelled)),
        ),
      ),
    );
    return new Map(profiles.map((profile) => [profile.id, profile]));
  }

  private async call<T>(
    request: FastifyRequest,
    reply: FastifyReply,
    unsafe: boolean,
    operation: (context: CallContext) => Promise<T>,
  ) {
    const traceId = randomUUID();
    reply.header('x-correlation-id', traceId);
    if (
      unsafe &&
      request.headers.origin !== this.config.get('APP_ORIGIN', { infer: true })
    )
      this.fail(
        403,
        'FORBIDDEN',
        'Request origin is not allowed',
        request,
        traceId,
      );
    const access = new Metadata();
    access.set('authorization', `Bearer ${cookies(request).dexa_access ?? ''}`);
    access.set('x-correlation-id', traceId);
    const options = { deadline: Date.now() + 3_000 };
    const cancelled = fromEvent(request.raw, 'aborted');
    try {
      const authorization = await firstValueFrom(
        this.identity
          .authorizeAccess(
            {
              audiences: [
                TokenAudience.TOKEN_AUDIENCE_IDENTITY,
                TokenAudience.TOKEN_AUDIENCE_ATTENDANCE,
              ],
            },
            access,
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
      const delegated = (audience: TokenAudience) =>
        authorization.tokens.find((token) => token.audience === audience)
          ?.token;
      const attendanceToken = delegated(
        TokenAudience.TOKEN_AUDIENCE_ATTENDANCE,
      );
      const identityToken = delegated(TokenAudience.TOKEN_AUDIENCE_IDENTITY);
      if (!attendanceToken || !identityToken)
        throw new Error('missing delegated token');
      const metadata = (token: string) => {
        const value = new Metadata();
        value.set('authorization', `Bearer ${token}`);
        value.set('x-correlation-id', traceId);
        return value;
      };
      const attendance = metadata(attendanceToken);
      const key = request.headers['idempotency-key'];
      if (unsafe) {
        if (typeof key !== 'string' || key.length < 1 || key.length > 128)
          this.fail(
            400,
            'IDEMPOTENCY_KEY_REQUIRED',
            'A valid Idempotency-Key header is required',
            request,
            traceId,
          );
        attendance.set('idempotency-key', key);
      }
      return await operation({
        attendance,
        identity: metadata(identityToken),
        options,
        cancelled,
      });
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
        errorCode ?? 'FORBIDDEN',
        'HRD access is required',
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
        errorCode ?? 'ATTENDANCE_ENTRY_NOT_FOUND',
        'Attendance entry was not found',
        request,
        traceId,
      );
    if (code === status.ALREADY_EXISTS)
      this.fail(
        409,
        errorCode ?? 'ENTRY_NOT_PENDING_REVIEW',
        'The decision conflicts with current state',
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
        errorCode ?? 'CLOCK_IN_REQUIRED',
        'The decision is not eligible',
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
