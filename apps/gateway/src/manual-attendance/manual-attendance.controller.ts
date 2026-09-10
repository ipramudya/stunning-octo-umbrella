import { Body, Controller, Inject, Post, Req, Res } from '@nestjs/common';
import { type AttendanceEntry, TokenAudience } from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { firstValueFrom, takeUntil } from 'rxjs';

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
  manualAttendanceRequest,
  manualAttendanceSchema,
  type ManualAttendanceDto,
} from './manual-attendance.dto.js';

@Controller({ version: '1' })
export class ManualAttendanceController {
  constructor(
    @Inject(ATTENDANCE_CLIENT)
    private readonly attendance: AttendanceGrpcClient,
    private readonly gatewayCall: GatewayCallService,
  ) {}

  @Post('me/attendance/manual')
  async create(
    @Body(new ZodValidationPipe(manualAttendanceSchema))
    body: ManualAttendanceDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.gatewayCall.run({
      request,
      reply,
      unsafe: true,
      idempotent: true,
      audiences: [TokenAudience.TOKEN_AUDIENCE_ATTENDANCE],
      operation: async (context) => {
        const entry = await firstValueFrom(
          this.attendance
            .createManualAttendance(
              manualAttendanceRequest(body),
              context.metadata(TokenAudience.TOKEN_AUDIENCE_ATTENDANCE),
              context.options,
            )
            .pipe(takeUntil(context.cancelled)),
        );

        let responseStatus = 201;
        if (entry.idempotentReplay) {
          responseStatus = 200;
        }

        reply.status(responseStatus);

        return this.attendanceResponse(entry);
      },
    });
  }

  private attendanceResponse(entry: AttendanceEntry) {
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
      decision: entry.decision ?? null,
    };
  }
}
