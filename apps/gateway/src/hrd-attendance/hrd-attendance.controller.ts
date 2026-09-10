// oxlint-disable max-params -- Nest supplies route handler dependencies separately.
import type { Metadata } from '@grpc/grpc-js';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  AttendanceOrder,
  ManualAttendanceDecision,
  TokenAudience,
} from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { firstValueFrom, takeUntil } from 'rxjs';

import { attendanceEntryIdSchema } from '../attendance/attendance.dto.js';
import { timestampIso } from '../attendance/attendance.helper.js';
import { GatewayCallService } from '../gateway-call/gateway-call.service.js';
import type { GatewayCallContext } from '../gateway-call/gateway-call.types.js';
import {
  ATTENDANCE_CLIENT,
  IDENTITY_CLIENT,
} from '../grpc-client/grpc-client.providers.js';
import type {
  AttendanceGrpcClient,
  IdentityGrpcClient,
} from '../grpc-client/grpc-client.types.js';
import { fail } from '../problem/problem.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  attendanceListSchema,
  type AttendanceListDto,
  rejectManualAttendanceSchema,
  type RejectManualAttendanceDto,
} from './hrd-attendance.dto.js';
import {
  attendanceEntryResponse,
  attendanceSource,
  attendanceStatus,
  clockType,
  requireProfile,
} from './hrd-attendance.mapper.js';

type CallContext = GatewayCallContext & {
  attendance: Metadata;
  identity: Metadata;
};

@Controller({ path: 'hrd/attendance', version: '1' })
export class HrdAttendanceController {
  constructor(
    @Inject(IDENTITY_CLIENT) private readonly identity: IdentityGrpcClient,
    @Inject(ATTENDANCE_CLIENT)
    private readonly attendance: AttendanceGrpcClient,
    private readonly gatewayCall: GatewayCallService,
  ) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(attendanceListSchema))
    query: AttendanceListDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.call(request, reply, false, async (context) => {
      let order = AttendanceOrder.ATTENDANCE_ORDER_DESC;
      if (query.order === 'asc') {
        order = AttendanceOrder.ATTENDANCE_ORDER_ASC;
      }

      const result = await firstValueFrom(
        this.attendance
          .listAttendance(
            {
              ...query,
              source: attendanceSource(query.source),
              status: attendanceStatus(query.status),
              clockType: clockType(query.clockType),
              order,
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
        items: result.items.map((entry) => {
          let reviewer;
          if (entry.decision?.decidedByEmployeeId) {
            reviewer = profiles.get(entry.decision.decidedByEmployeeId);
          }

          return attendanceEntryResponse(
            entry,
            requireProfile(profiles, entry.employeeId),
            reviewer,
          );
        }),
        pageInfo: {
          nextCursor: result.nextCursor || undefined,
          hasNextPage: result.hasNextPage,
        },
      };
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

      let reviewer;
      if (entry.decision?.decidedByEmployeeId) {
        reviewer = profiles.get(entry.decision.decidedByEmployeeId);
      }

      return attendanceEntryResponse(
        entry,
        requireProfile(profiles, entry.employeeId),
        reviewer,
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
      let reviewer;
      if (reviewerId) {
        reviewer = profiles.get(reviewerId);
      }

      return attendanceEntryResponse(
        result,
        requireProfile(profiles, result.employeeId),
        reviewer,
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
    });
  }
}
