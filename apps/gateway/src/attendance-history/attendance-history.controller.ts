import { Metadata, type CallOptions } from '@grpc/grpc-js';
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
  attendanceLocation,
  attendanceSourceName,
  attendanceStatusName,
  clockTypeName,
  optionalTimestampIso,
  timestampIso,
} from '../attendance/attendance.helper.js';
import { GatewayCallService } from '../gateway-call/gateway-call.service.js';
import { ATTENDANCE_CLIENT } from '../grpc-client/grpc-client.providers.js';
import type { AttendanceGrpcClient } from '../grpc-client/grpc-client.types.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  employeeAttendanceListSchema,
  type EmployeeAttendanceListDto,
} from './attendance-history.dto.js';

@Controller({ path: 'me/attendance', version: '1' })
export class AttendanceHistoryController {
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
      location: attendanceLocation(entry.location),
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
    });
  }
}
