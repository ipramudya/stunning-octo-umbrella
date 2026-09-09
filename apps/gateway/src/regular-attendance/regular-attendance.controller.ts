import {
  Body,
  Controller,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ClockType, TokenAudience } from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { firstValueFrom, takeUntil } from 'rxjs';

import { attendanceFailure } from '../attendance-zone/attendance-failure.js';
import { timestampIso } from '../attendance/attendance.helper.js';
import { GatewayCallService } from '../gateway-call/gateway-call.service.js';
import { ATTENDANCE_CLIENT } from '../grpc-client/grpc-client.providers.js';
import type { AttendanceGrpcClient } from '../grpc-client/grpc-client.types.js';
import { regularAttendanceSchema } from './regular-attendance.dto.js';

@Controller({ version: '1' })
export class RegularAttendanceController {
  constructor(
    @Inject(ATTENDANCE_CLIENT)
    private readonly attendance: AttendanceGrpcClient,
    private readonly gatewayCall: GatewayCallService,
  ) {}

  @Post('me/attendance/regular')
  create(
    @Body() untrustedBody: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.gatewayCall.run({
      request,
      reply,
      unsafe: true,
      idempotent: true,
      rateLimited: true,
      audiences: [TokenAudience.TOKEN_AUDIENCE_ATTENDANCE],
      operation: async (context) => {
        const parsed = regularAttendanceSchema.safeParse(untrustedBody);
        if (!parsed.success) {
          throw new HttpException(
            {
              type: 'about:blank',
              title: 'Bad Request',
              status: 400,
              detail: 'Request validation failed',
              instance: request.url,
              code: 'VALIDATION_ERROR',
              traceId: context.traceId,
              errors: parsed.error.issues.map((issue) => ({
                field: issue.path.join('.'),
                message: issue.message,
              })),
            },
            400,
          );
        }
        const body = parsed.data;
        let clockType = ClockType.CLOCK_TYPE_CLOCK_OUT;
        if (body.clockType === 'CLOCK_IN') {
          clockType = ClockType.CLOCK_TYPE_CLOCK_IN;
        }
        const result = await firstValueFrom(
          this.attendance
            .createRegularAttendance(
              { ...body, clockType },
              context.metadata(TokenAudience.TOKEN_AUDIENCE_ATTENDANCE),
              context.options,
            )
            .pipe(takeUntil(context.cancelled)),
        );
        if (!result.occurredAt || !result.submittedAt || !result.location) {
          throw new Error('invalid regular attendance response');
        }
        let responseStatus = 201;
        if (result.idempotentReplay) {
          responseStatus = 200;
        }
        reply.status(responseStatus);
        let responseClockType = 'CLOCK_OUT';
        if (result.clockType === ClockType.CLOCK_TYPE_CLOCK_IN) {
          responseClockType = 'CLOCK_IN';
        }
        return {
          id: result.id,
          employeeId: result.employeeId,
          workDate: result.workDate,
          clockType: responseClockType,
          source: 'REGULAR',
          status: 'RECORDED',
          occurredAt: timestampIso(result.occurredAt),
          claimedAt: null,
          submittedAt: timestampIso(result.submittedAt),
          location: { ...result.location, address: null },
          reason: null,
          evidenceId: result.evidenceId,
          decision: null,
        };
      },
      failure: (error, traceId) =>
        attendanceFailure({
          error,
          request,
          traceId,
          regularAttendance: true,
          reply,
        }),
    });
  }
}
