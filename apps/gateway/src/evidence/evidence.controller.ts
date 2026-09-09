import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  type AuthorizeEvidenceAccessRequest,
  type EvidenceAccessAuthorization,
  type EvidenceUploadAuthorization,
  TokenAudience,
} from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { firstValueFrom, type Observable, takeUntil } from 'rxjs';

import { attendanceFailure } from '../attendance-zone/attendance-failure.js';
import { timestampIso } from '../attendance/attendance.helper.js';
import { GatewayCallService } from '../gateway-call/gateway-call.service.js';
import { ATTENDANCE_CLIENT } from '../grpc-client/grpc-client.providers.js';
import type { AttendanceGrpcClient } from '../grpc-client/grpc-client.types.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  evidenceUploadSchema,
  type EvidenceUploadDto,
} from './evidence.dto.js';

@Controller({ version: '1' })
export class EvidenceController {
  constructor(
    @Inject(ATTENDANCE_CLIENT)
    private readonly attendance: AttendanceGrpcClient,
    private readonly gatewayCall: GatewayCallService,
  ) {}

  @Post('me/evidence-uploads')
  authorizeUpload(
    @Body(new ZodValidationPipe(evidenceUploadSchema)) body: EvidenceUploadDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.status(201);

    return this.call({ operation: 'upload', body, request, reply });
  }

  @Post('evidence/:evidenceId/access')
  @HttpCode(200)
  authorizeAccess(
    @Param('evidenceId') evidenceId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.call({
      operation: 'access',
      body: { evidenceId },
      request,
      reply,
    });
  }

  private call({
    operation,
    body,
    request,
    reply,
  }: {
    operation: 'upload' | 'access';
    body: EvidenceUploadDto | AuthorizeEvidenceAccessRequest;
    request: FastifyRequest;
    reply: FastifyReply;
  }) {
    return this.gatewayCall.run({
      request,
      reply,
      unsafe: true,
      audiences: [TokenAudience.TOKEN_AUDIENCE_ATTENDANCE],
      operation: async (context) => {
        const metadata = context.metadata(
          TokenAudience.TOKEN_AUDIENCE_ATTENDANCE,
        );
        let response: Observable<
          EvidenceUploadAuthorization | EvidenceAccessAuthorization
        >;
        if (operation === 'upload' && 'contentType' in body) {
          response = this.attendance.authorizeEvidenceUpload(
            body,
            metadata,
            context.options,
          );
        } else if (operation === 'access' && 'evidenceId' in body) {
          response = this.attendance.authorizeEvidenceAccess(
            body,
            metadata,
            context.options,
          );
        } else {
          throw new Error('invalid evidence operation');
        }

        const result = await firstValueFrom(
          response.pipe(takeUntil(context.cancelled)),
        );

        return { ...result, expiresAt: timestampIso(result.expiresAt) };
      },
      failure: (error, traceId) =>
        attendanceFailure({ error, request, traceId }),
    });
  }
}
