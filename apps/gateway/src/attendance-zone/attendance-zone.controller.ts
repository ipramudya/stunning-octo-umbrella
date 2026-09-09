import { status } from '@grpc/grpc-js';
import type { OnModuleInit } from '@nestjs/common';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
// oxlint-disable max-params
import {
  type AuthorizeEvidenceAccessRequest,
  ClockType,
  type EvidenceAccessAuthorization,
  type EvidenceUploadAuthorization,
  TokenAudience,
} from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { firstValueFrom, type Observable, takeUntil } from 'rxjs';

import { timestampIso } from '../attendance/attendance.helper.js';
import {
  evidenceUploadSchema,
  type EvidenceUploadDto,
} from '../evidence/evidence.dto.js';
import { GatewayCallService } from '../gateway-call/gateway-call.service.js';
import type { AttendanceGrpcClient } from '../grpc-client/grpc-client.types.js';
import { grpcCode, grpcErrorCode } from '../grpc-client/grpc-error.js';
import { ATTENDANCE_HEALTH_CLIENT } from '../health/grpc-health.client.js';
import { fail } from '../problem/problem.js';
import { regularAttendanceSchema } from '../regular-attendance/regular-attendance.dto.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  attendanceZoneSchema,
  type AttendanceZoneDto,
} from './attendance-zone.dto.js';

@Controller({ version: '1' })
export class AttendanceZoneController implements OnModuleInit {
  private attendance!: AttendanceGrpcClient;

  constructor(
    @Inject(ATTENDANCE_HEALTH_CLIENT)
    private readonly attendanceGrpc: ClientGrpc,
    private readonly gatewayCall: GatewayCallService,
  ) {}

  onModuleInit() {
    this.attendance =
      this.attendanceGrpc.getService<AttendanceGrpcClient>('AttendanceService');
  }

  @Get('attendance-zone')
  get(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.call(request, reply);
  }

  @Post('me/evidence-uploads')
  async authorizeEvidenceUpload(
    @Body(new ZodValidationPipe(evidenceUploadSchema)) body: EvidenceUploadDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.status(201);
    return this.evidenceCall('upload', body, request, reply);
  }

  @Post('me/attendance/regular')
  async createRegularAttendance(
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
        const result = await firstValueFrom(
          this.attendance
            .createRegularAttendance(
              {
                ...body,
                clockType:
                  body.clockType === 'CLOCK_IN'
                    ? ClockType.CLOCK_TYPE_CLOCK_IN
                    : ClockType.CLOCK_TYPE_CLOCK_OUT,
              },
              context.metadata(TokenAudience.TOKEN_AUDIENCE_ATTENDANCE),
              context.options,
            )
            .pipe(takeUntil(context.cancelled)),
        );
        if (!result.occurredAt || !result.submittedAt || !result.location) {
          throw new Error('invalid regular attendance response');
        }
        reply.status(result.idempotentReplay ? 200 : 201);
        return {
          id: result.id,
          employeeId: result.employeeId,
          workDate: result.workDate,
          clockType:
            result.clockType === ClockType.CLOCK_TYPE_CLOCK_IN
              ? 'CLOCK_IN'
              : 'CLOCK_OUT',
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
        this.grpcFailure(error, request, traceId, true, reply),
    });
  }

  @Post('evidence/:evidenceId/access')
  @HttpCode(200)
  authorizeEvidenceAccess(
    @Param('evidenceId') evidenceId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.evidenceCall('access', { evidenceId }, request, reply);
  }

  @Patch('hrd/attendance-zone')
  update(
    @Body(new ZodValidationPipe(attendanceZoneSchema)) body: AttendanceZoneDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.call(request, reply, body);
  }

  private async evidenceCall(
    operation: 'upload' | 'access',
    body: EvidenceUploadDto | AuthorizeEvidenceAccessRequest,
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
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
      failure: (error, traceId) => this.grpcFailure(error, request, traceId),
    });
  }

  private async call(
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
        return firstValueFrom(
          (body
            ? this.attendance.updateAttendanceZone(
                body,
                metadata,
                context.options,
              )
            : this.attendance.getAttendanceZone({}, metadata, context.options)
          ).pipe(takeUntil(context.cancelled)),
        );
      },
      failure: (error, traceId) => this.grpcFailure(error, request, traceId),
    });
  }

  private grpcFailure(
    error: unknown,
    request: FastifyRequest,
    traceId: string,
    regularAttendance = false,
    reply?: FastifyReply,
  ): never {
    if (error instanceof HttpException) {
      throw error;
    }
    const code = grpcCode(error);
    const backendErrorCode = grpcErrorCode(error);
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
        'FORBIDDEN',
        regularAttendance
          ? 'Employee access is required'
          : 'HRD access is required',
        request,
        traceId,
      );
    }
    if (code === status.INVALID_ARGUMENT) {
      fail(
        400,
        backendErrorCode ?? 'VALIDATION_ERROR',
        'Request validation failed',
        request,
        traceId,
      );
    }
    if (code === status.NOT_FOUND) {
      fail(
        404,
        'EVIDENCE_NOT_FOUND',
        'Evidence was not found',
        request,
        traceId,
      );
    }
    if (code === status.ALREADY_EXISTS) {
      const errorCode = backendErrorCode ?? 'ATTENDANCE_ALREADY_EXISTS';
      if (errorCode === 'REQUEST_IN_PROGRESS') {
        reply?.header('retry-after', 1);
      }
      fail(
        409,
        errorCode,
        'Attendance could not be recorded',
        request,
        traceId,
      );
    }
    if (code === status.FAILED_PRECONDITION) {
      const errorCode = backendErrorCode ?? 'EVIDENCE_INVALID';
      fail(
        regularAttendance ? 422 : 409,
        errorCode,
        regularAttendance
          ? 'Attendance is not eligible'
          : 'Evidence is not available',
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
      backendErrorCode ?? 'DEPENDENCY_UNAVAILABLE',
      'The service is temporarily unavailable',
      request,
      traceId,
    );
  }
}
