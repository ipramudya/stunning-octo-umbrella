import { Body, Controller, Get, Inject, Patch, Req, Res } from '@nestjs/common';
import { TokenAudience } from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { firstValueFrom, takeUntil } from 'rxjs';

import { GatewayCallService } from '../gateway-call/gateway-call.service.js';
import { ATTENDANCE_CLIENT } from '../grpc-client/grpc-client.providers.js';
import type { AttendanceGrpcClient } from '../grpc-client/grpc-client.types.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import { attendanceFailure } from './attendance-failure.js';
import {
  attendanceZoneSchema,
  type AttendanceZoneDto,
} from './attendance-zone.dto.js';

@Controller({ version: '1' })
export class AttendanceZoneController {
  constructor(
    @Inject(ATTENDANCE_CLIENT)
    private readonly attendance: AttendanceGrpcClient,
    private readonly gatewayCall: GatewayCallService,
  ) {}

  @Get('attendance-zone')
  get(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.call(request, reply);
  }

  @Patch('hrd/attendance-zone')
  update(
    @Body(new ZodValidationPipe(attendanceZoneSchema)) body: AttendanceZoneDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.call(request, reply, body);
  }

  private call(
    request: FastifyRequest,
    reply: FastifyReply,
    body?: AttendanceZoneDto,
  ) {
    return this.gatewayCall.run({
      request,
      reply,
      unsafe: body !== undefined,
      audiences: [TokenAudience.TOKEN_AUDIENCE_ATTENDANCE],
      operation: (context) => {
        const metadata = context.metadata(
          TokenAudience.TOKEN_AUDIENCE_ATTENDANCE,
        );
        let response = this.attendance.getAttendanceZone(
          {},
          metadata,
          context.options,
        );

        if (body) {
          response = this.attendance.updateAttendanceZone(
            body,
            metadata,
            context.options,
          );
        }

        return firstValueFrom(response.pipe(takeUntil(context.cancelled)));
      },
      failure: (error, traceId) =>
        attendanceFailure({ error, request, traceId }),
    });
  }
}
