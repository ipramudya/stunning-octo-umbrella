// oxlint-disable max-params -- Nest supplies route handler dependencies separately.
import { status } from '@grpc/grpc-js';
import {
  Body,
  Controller,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { type AttendanceEntry, TokenAudience } from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { firstValueFrom, takeUntil } from 'rxjs';

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
import {
  grpcCode,
  grpcErrorCode,
  grpcMetadata,
} from '../grpc-client/grpc-error.js';
import { fail } from '../problem/problem.js';
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
      failure: (error, traceId) =>
        this.grpcFailure(error, request, reply, traceId),
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
      location: {
        address: entry.location?.address ?? null,
        latitude: entry.location?.latitude ?? null,
        longitude: entry.location?.longitude ?? null,
        accuracyMeters: entry.location?.accuracyMeters ?? null,
        distanceMeters: entry.location?.distanceMeters ?? null,
      },
      reason: entry.reason ?? null,
      evidenceId: entry.evidenceId ?? null,
      decision: entry.decision ?? null,
    };
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
      fail(403, 'FORBIDDEN', 'Employee access is required', request, traceId);
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
        errorCode ?? 'EVIDENCE_NOT_FOUND',
        'Evidence was not found',
        request,
        traceId,
      );
    }

    if (code === status.ALREADY_EXISTS) {
      fail(
        409,
        errorCode ?? 'ATTENDANCE_ALREADY_EXISTS',
        'The request conflicts with existing data',
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
        errorCode ?? 'EVIDENCE_INVALID',
        'The request cannot be processed',
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

    if (
      code === status.UNAVAILABLE &&
      errorCode === 'EVIDENCE_FINALIZATION_FAILED'
    ) {
      fail(503, errorCode, 'Evidence finalization failed', request, traceId);
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
