// oxlint-disable max-params -- Nest supplies route handler dependencies separately.
import { status, type Metadata } from '@grpc/grpc-js';
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
import type { ClientGrpc } from '@nestjs/microservices';
import {
  type AttendanceEntry,
  AttendanceOrder,
  AttendanceSource,
  AttendanceStatus,
  ClockType,
  type EmployeeProfile,
  ManualAttendanceDecision,
  TokenAudience,
} from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { firstValueFrom, takeUntil } from 'rxjs';

import { attendanceEntryIdSchema } from '../attendance/attendance.dto.js';
import {
  attendanceStatusName,
  timestampIso,
} from '../attendance/attendance.helper.js';
import { GatewayCallService } from '../gateway-call/gateway-call.service.js';
import type { GatewayCallContext } from '../gateway-call/gateway-call.types.js';
import type {
  AttendanceGrpcClient,
  IdentityGrpcClient,
} from '../grpc-client/grpc-client.types.js';
import {
  grpcCode,
  grpcErrorCode,
  grpcMetadata,
} from '../grpc-client/grpc-error.js';
import {
  ATTENDANCE_HEALTH_CLIENT,
  IDENTITY_HEALTH_CLIENT,
} from '../health/grpc-health.client.js';
import { fail } from '../problem/problem.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  attendanceListSchema,
  type AttendanceListDto,
  pendingManualListSchema,
  type PendingManualListDto,
  rejectManualAttendanceSchema,
  type RejectManualAttendanceDto,
} from './manual-decision.dto.js';

type CallContext = GatewayCallContext & {
  attendance: Metadata;
  identity: Metadata;
};

@Controller({ path: 'hrd/attendance', version: '1' })
export class ManualDecisionController implements OnModuleInit {
  private identity!: IdentityGrpcClient;
  private attendance!: AttendanceGrpcClient;

  private requireProfile(
    profiles: Map<string, EmployeeProfile>,
    employeeId: string,
  ) {
    const profile = profiles.get(employeeId);
    if (!profile) {
      throw new Error(`employee profile missing: ${employeeId}`);
    }
    return profile;
  }

  private person(value: EmployeeProfile) {
    return {
      id: value.id,
      employeeNumber: value.employeeNumber,
      fullName: value.fullName,
    };
  }

  private attendanceSource(value: AttendanceListDto['source']) {
    if (value === 'REGULAR') {
      return AttendanceSource.ATTENDANCE_SOURCE_REGULAR;
    }
    if (value === 'MANUAL') {
      return AttendanceSource.ATTENDANCE_SOURCE_MANUAL;
    }
  }

  private attendanceStatus(value: AttendanceListDto['status']) {
    if (value === 'PENDING_REVIEW') {
      return AttendanceStatus.ATTENDANCE_STATUS_PENDING_REVIEW;
    }
    if (value === 'RECORDED') {
      return AttendanceStatus.ATTENDANCE_STATUS_RECORDED;
    }
    if (value === 'REJECTED') {
      return AttendanceStatus.ATTENDANCE_STATUS_REJECTED;
    }
  }

  private clockType(value: AttendanceListDto['clockType']) {
    if (value === 'CLOCK_IN') {
      return ClockType.CLOCK_TYPE_CLOCK_IN;
    }
    if (value === 'CLOCK_OUT') {
      return ClockType.CLOCK_TYPE_CLOCK_OUT;
    }
  }

  private entryResponse(
    entry: AttendanceEntry,
    employee: EmployeeProfile,
    reviewer?: EmployeeProfile,
  ) {
    return {
      id: entry.id,
      employeeId: entry.employeeId,
      employee: this.person(employee),
      workDate: entry.workDate,
      clockType:
        entry.clockType === ClockType.CLOCK_TYPE_CLOCK_IN
          ? 'CLOCK_IN'
          : 'CLOCK_OUT',
      source:
        entry.source === AttendanceSource.ATTENDANCE_SOURCE_MANUAL
          ? 'MANUAL'
          : 'REGULAR',
      status: attendanceStatusName(entry.status),
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
              reviewer: this.person(reviewer),
              reason: entry.decision.reason || null,
            }
          : null,
    };
  }

  constructor(
    @Inject(IDENTITY_HEALTH_CLIENT) private readonly identityGrpc: ClientGrpc,
    @Inject(ATTENDANCE_HEALTH_CLIENT)
    private readonly attendanceGrpc: ClientGrpc,
    private readonly gatewayCall: GatewayCallService,
  ) {}

  onModuleInit() {
    this.identity =
      this.identityGrpc.getService<IdentityGrpcClient>('IdentityService');
    this.attendance =
      this.attendanceGrpc.getService<AttendanceGrpcClient>('AttendanceService');
  }

  @Get()
  async list(
    @Query(new ZodValidationPipe(attendanceListSchema))
    query: AttendanceListDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.call(request, reply, false, async (context) => {
      const result = await firstValueFrom(
        this.attendance
          .listAttendance(
            {
              ...query,
              source: this.attendanceSource(query.source),
              status: this.attendanceStatus(query.status),
              clockType: this.clockType(query.clockType),
              order:
                query.order === 'asc'
                  ? AttendanceOrder.ATTENDANCE_ORDER_ASC
                  : AttendanceOrder.ATTENDANCE_ORDER_DESC,
            },
            context.attendance,
            context.options,
          )
          .pipe(takeUntil(context.cancelled)),
      );
      const profiles = await this.profiles(
        result.items.flatMap((entry) => [
          entry.employeeId,
          entry.decision?.decidedByEmployeeId ?? '',
        ]),
        context,
      );
      return {
        items: result.items.map((entry) =>
          this.entryResponse(
            entry,
            this.requireProfile(profiles, entry.employeeId),
            entry.decision?.decidedByEmployeeId
              ? profiles.get(entry.decision.decidedByEmployeeId)
              : undefined,
          ),
        ),
        pageInfo: {
          nextCursor: result.nextCursor || undefined,
          hasNextPage: result.hasNextPage,
        },
      };
    });
  }

  @Get('manual')
  async listPending(
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
          this.entryResponse(
            entry,
            this.requireProfile(profiles, entry.employeeId),
          ),
        ),
        pageInfo: {
          nextCursor: result.nextCursor || undefined,
          hasNextPage: result.hasNextPage,
        },
      };
    });
  }

  @Get('manual/:entryId')
  async getManual(
    @Param('entryId', new ZodValidationPipe(attendanceEntryIdSchema))
    entryId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.call(request, reply, false, async (context) => {
      const entry = await firstValueFrom(
        this.attendance
          .getManualAttendance({ entryId }, context.attendance, context.options)
          .pipe(takeUntil(context.cancelled)),
      );
      const profiles = await this.profiles([entry.employeeId], context);
      return this.entryResponse(
        entry,
        this.requireProfile(profiles, entry.employeeId),
      );
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
      if (entry.decision?.decidedByEmployeeId) {
        ids.push(entry.decision.decidedByEmployeeId);
      }
      const profiles = await this.profiles(ids, context);
      return this.entryResponse(
        entry,
        this.requireProfile(profiles, entry.employeeId),
        entry.decision?.decidedByEmployeeId
          ? profiles.get(entry.decision.decidedByEmployeeId)
          : undefined,
      );
    });
  }

  @Post(':entryId/evidence/access')
  @HttpCode(200)
  async evidenceAccess(
    @Param('entryId', new ZodValidationPipe(attendanceEntryIdSchema))
    entryId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.call(
      request,
      reply,
      true,
      async (context) => {
        const entry = await this.getEntry(entryId, context);
        if (!entry.evidenceId) {
          fail(
            404,
            'EVIDENCE_NOT_FOUND',
            'Evidence was not found',
            request,
            context.traceId,
          );
        }
        const result = await firstValueFrom(
          this.attendance
            .authorizeEvidenceAccess(
              { evidenceId: entry.evidenceId },
              context.attendance,
              context.options,
            )
            .pipe(takeUntil(context.cancelled)),
        );
        return { ...result, expiresAt: timestampIso(result.expiresAt) };
      },
      false,
    );
  }

  @Post('manual/:entryId/approve')
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

  @Post('manual/:entryId/reject')
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
      return this.entryResponse(
        result,
        this.requireProfile(profiles, result.employeeId),
        reviewerId ? profiles.get(reviewerId) : undefined,
      );
    });
  }

  private getEntry(entryId: string, context: CallContext) {
    return firstValueFrom(
      this.attendance
        .getAttendance({ entryId }, context.attendance, context.options)
        .pipe(takeUntil(context.cancelled)),
    );
  }

  private async profiles(employeeIds: string[], context: CallContext) {
    const ids = [...new Set(employeeIds.filter(Boolean))];
    const responses = await Promise.all(
      Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) =>
        firstValueFrom(
          this.identity
            .batchGetEmployees(
              { employeeIds: ids.slice(index * 100, index * 100 + 100) },
              context.identity,
              context.options,
            )
            .pipe(takeUntil(context.cancelled)),
        ),
      ),
    );
    const profiles = responses.flatMap((response) => response.items);
    return new Map(profiles.map((profile) => [profile.id, profile]));
  }

  private async call<T>(
    request: FastifyRequest,
    reply: FastifyReply,
    unsafe: boolean,
    operation: (context: CallContext) => Promise<T>,
    idempotent = unsafe,
  ) {
    return this.gatewayCall.run({
      request,
      reply,
      unsafe,
      idempotent,
      audiences: [
        TokenAudience.TOKEN_AUDIENCE_IDENTITY,
        TokenAudience.TOKEN_AUDIENCE_ATTENDANCE,
      ],
      rateLimited: true,
      operation: (context) =>
        operation({
          ...context,
          attendance: context.metadata(TokenAudience.TOKEN_AUDIENCE_ATTENDANCE),
          identity: context.metadata(TokenAudience.TOKEN_AUDIENCE_IDENTITY),
        }),
      failure: (error, traceId) =>
        this.grpcFailure(error, request, reply, traceId),
    });
  }

  private grpcFailure(
    error: unknown,
    request: FastifyRequest,
    reply: FastifyReply,
    traceId: string,
  ): never {
    if (error instanceof HttpException) {
      throw error;
    }
    const code = grpcCode(error);
    const errorCode = grpcErrorCode(error);
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
      fail(
        403,
        errorCode ?? 'FORBIDDEN',
        'HRD access is required',
        request,
        traceId,
      );
    }
    if (code === status.INVALID_ARGUMENT) {
      fail(
        400,
        errorCode ?? 'VALIDATION_ERROR',
        'Request validation failed',
        request,
        traceId,
      );
    }
    if (code === status.NOT_FOUND) {
      fail(
        404,
        errorCode ?? 'ATTENDANCE_ENTRY_NOT_FOUND',
        'Attendance entry was not found',
        request,
        traceId,
      );
    }
    if (code === status.ALREADY_EXISTS) {
      fail(
        409,
        errorCode ?? 'ENTRY_NOT_PENDING_REVIEW',
        'The decision conflicts with current state',
        request,
        traceId,
      );
    }
    if (code === status.ABORTED) {
      reply.header('retry-after', grpcMetadata(error, 'retry-after') ?? '1');
      fail(
        409,
        errorCode ?? 'REQUEST_IN_PROGRESS',
        'The request is already in progress',
        request,
        traceId,
      );
    }
    if (code === status.FAILED_PRECONDITION) {
      fail(
        422,
        errorCode ?? 'CLOCK_IN_REQUIRED',
        'The decision is not eligible',
        request,
        traceId,
      );
    }
    if (code === status.DEADLINE_EXCEEDED) {
      fail(
        504,
        'DOWNSTREAM_TIMEOUT',
        'The request timed out',
        request,
        traceId,
      );
    }
    fail(
      503,
      'DEPENDENCY_UNAVAILABLE',
      'The service is temporarily unavailable',
      request,
      traceId,
    );
  }
}
