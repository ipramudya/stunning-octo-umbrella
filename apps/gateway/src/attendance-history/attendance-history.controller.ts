import { status, Metadata, type CallOptions } from '@grpc/grpc-js';
import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { type AttendanceEntry, TokenAudience } from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { firstValueFrom, type Observable, takeUntil } from 'rxjs';

import { attendanceEntryIdSchema } from '../attendance/attendance.dto.js';
import {
  attendanceSourceName,
  attendanceStatusName,
  clockTypeName,
  optionalTimestampIso,
  timestampIso,
} from '../attendance/attendance.helper.js';
import { GatewayCallService } from '../gateway-call/gateway-call.service.js';
import { ATTENDANCE_CLIENT } from '../grpc-client/grpc-client.providers.js';
import type { AttendanceGrpcClient } from '../grpc-client/grpc-client.types.js';
import { grpcCode, grpcErrorCode } from '../grpc-client/grpc-error.js';
import { fail } from '../problem/problem.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  employeeAttendanceListSchema,
  type EmployeeAttendanceListDto,
} from './attendance-history.dto.js';

@Controller({ path: 'me/attendance', version: '1' })
export class AttendanceHistoryController {
  private response(entry: AttendanceEntry) {
    return {
      id: entry.id,
      employeeId: entry.employeeId,
      workDate: entry.workDate,
      clockType: clockTypeName(entry.clockType),
      source: attendanceSourceName(entry.source),
      status: attendanceStatusName(entry.status),
      occurredAt: optionalTimestampIso(entry.occurredAt),
      claimedAt: optionalTimestampIso(entry.claimedAt),
      submittedAt: timestampIso(entry.submittedAt),
      location: entry.location,
      reason: entry.reason ?? null,
      evidenceId: entry.evidenceId ?? null,
      decision: this.decision(entry),
    };
  }

  private decision(entry: AttendanceEntry) {
    if (!entry.decision?.decidedByEmployeeId) {
      return null;
    }

    return {
      decidedByEmployeeId: entry.decision.decidedByEmployeeId,
      decidedAt: timestampIso(entry.decision.decidedAt),
      reason: entry.decision.reason || null,
    };
  }

  constructor(
    @Inject(ATTENDANCE_CLIENT)
    private readonly attendance: AttendanceGrpcClient,
    private readonly gatewayCall: GatewayCallService,
  ) {}

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
