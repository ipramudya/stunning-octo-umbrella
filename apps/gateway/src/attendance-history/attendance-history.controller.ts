import { status, Metadata, type CallOptions } from '@grpc/grpc-js';
import type { OnModuleInit } from '@nestjs/common';
import {
  Controller,
  Get,
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
  ClockType,
  TokenAudience,
} from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { firstValueFrom, type Observable, takeUntil } from 'rxjs';

import { attendanceEntryIdSchema } from '../attendance/attendance.dto.js';
import {
  attendanceStatusName,
  hasTimestamp,
  timestampIso,
} from '../attendance/attendance.helper.js';
import { GatewayCallService } from '../gateway-call/gateway-call.service.js';
import type { AttendanceGrpcClient } from '../grpc-client/grpc-client.types.js';
import { grpcCode, grpcErrorCode } from '../grpc-client/grpc-error.js';
import { ATTENDANCE_HEALTH_CLIENT } from '../health/grpc-health.client.js';
import { fail } from '../problem/problem.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  employeeAttendanceListSchema,
  type EmployeeAttendanceListDto,
} from './attendance-history.dto.js';

@Controller({ path: 'me/attendance', version: '1' })
export class AttendanceHistoryController implements OnModuleInit {
  private attendance!: AttendanceGrpcClient;

  private response(entry: AttendanceEntry) {
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
      status: attendanceStatusName(entry.status),
      occurredAt: hasTimestamp(entry.occurredAt)
        ? timestampIso(entry.occurredAt)
        : null,
      claimedAt: hasTimestamp(entry.claimedAt)
        ? timestampIso(entry.claimedAt)
        : null,
      submittedAt: timestampIso(entry.submittedAt),
      location: entry.location,
      reason: entry.reason ?? null,
      evidenceId: entry.evidenceId ?? null,
      decision: entry.decision?.decidedByEmployeeId
        ? {
            decidedByEmployeeId: entry.decision.decidedByEmployeeId,
            decidedAt: timestampIso(entry.decision.decidedAt),
            reason: entry.decision.reason || null,
          }
        : null,
    };
  }

  constructor(
    @Inject(ATTENDANCE_HEALTH_CLIENT)
    private readonly attendanceGrpc: ClientGrpc,
    private readonly gatewayCall: GatewayCallService,
  ) {}

  onModuleInit() {
    this.attendance =
      this.attendanceGrpc.getService<AttendanceGrpcClient>('AttendanceService');
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
    return { items: result.items.map((entry) => this.response(entry)) };
  }

  @Get(':entryId')
  async get(
    @Param('entryId', new ZodValidationPipe(attendanceEntryIdSchema))
    entryId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.response(
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
    return this.gatewayCall.run({
      request,
      reply,
      audiences: [TokenAudience.TOKEN_AUDIENCE_ATTENDANCE],
      rateLimited: true,
      operation: (context) =>
        firstValueFrom(
          operation(
            context.metadata(TokenAudience.TOKEN_AUDIENCE_ATTENDANCE),
            context.options,
          ).pipe(takeUntil(context.cancelled)),
        ),
      failure: (error, traceId) => {
        const grpcStatus = grpcCode(error);
        const code = grpcErrorCode(error);
        if (grpcStatus === status.UNAUTHENTICATED) {
          fail(
            401,
            'AUTHENTICATION_REQUIRED',
            'Authentication is required',
            request,
            traceId,
          );
        }
        if (grpcStatus === status.PERMISSION_DENIED) {
          fail(
            403,
            'FORBIDDEN',
            'Employee access is required',
            request,
            traceId,
          );
        }
        if (grpcStatus === status.INVALID_ARGUMENT) {
          fail(
            400,
            code ?? 'VALIDATION_ERROR',
            'Request validation failed',
            request,
            traceId,
          );
        }
        if (grpcStatus === status.NOT_FOUND) {
          fail(
            404,
            'ATTENDANCE_ENTRY_NOT_FOUND',
            'Attendance entry was not found',
            request,
            traceId,
          );
        }
        if (grpcStatus === status.DEADLINE_EXCEEDED) {
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
      },
    });
  }
}
