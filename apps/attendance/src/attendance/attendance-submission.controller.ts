import { status, type Metadata } from '@grpc/grpc-js';
import { Controller, UseFilters, UseGuards } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import {
  ClockType,
  type CreateManualAttendanceRequest,
  type CreateRegularAttendanceRequest,
} from '@project/contracts';
import { z } from 'zod';

import { GrpcAuthGuard } from '../auth/grpc-auth.guard.js';
import { GrpcAuthorizationService } from '../auth/grpc-authorization.service.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ManualAttendanceService } from '../manual-attendance/manual-attendance.service.js';
import { RegularAttendanceService } from '../regular-attendance/regular-attendance.service.js';
import { AttendanceExceptionFilter } from './attendance-exception.filter.js';
import { failure } from './attendance.error.js';
import { grpcTimestamp, protoDate } from './attendance.helper.js';

const regularSchema = z.object({
  clockType: z.union([
    z.literal(ClockType.CLOCK_TYPE_CLOCK_IN),
    z.literal(ClockType.CLOCK_TYPE_CLOCK_OUT),
  ]),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number(),
  evidenceUploadId: z.uuid(),
});

const manualSchema = z.object({
  clockType: z.union([
    z.literal(ClockType.CLOCK_TYPE_CLOCK_IN),
    z.literal(ClockType.CLOCK_TYPE_CLOCK_OUT),
  ]),
  workDate: z.iso.date(),
  claimedAt: z.unknown().transform(protoDate).pipe(z.date()),
  address: z.string().trim().min(1).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  reason: z.string().trim().min(1).max(1000),
  evidenceUploadId: z.uuid(),
});

@Controller()
@UseFilters(AttendanceExceptionFilter)
@UseGuards(GrpcAuthGuard, RolesGuard)
@Roles('EMPLOYEE')
export class AttendanceSubmissionController {
  constructor(
    private readonly authorization: GrpcAuthorizationService,
    private readonly regularAttendance: RegularAttendanceService,
    private readonly manualAttendance: ManualAttendanceService,
  ) {}

  @GrpcMethod('AttendanceService', 'CreateRegularAttendance')
  async createRegularAttendance(
    request: CreateRegularAttendanceRequest,
    metadata: Metadata,
  ) {
    const claims = this.authorization.claims(metadata);

    const parsed = regularSchema.safeParse(request);

    if (!parsed.success) {
      failure(status.INVALID_ARGUMENT, 'VALIDATION_ERROR');
    }

    const key = this.idempotencyKey(metadata);

    const result = await this.regularAttendance.create(claims.sub, key, {
      ...parsed.data,
      clockType: this.clockTypeName(parsed.data.clockType),
    });

    return {
      ...result.entry,
      clockType: this.clockType(result.entry.clockType),
      occurredAt: grpcTimestamp(new Date(result.entry.occurredAt)),
      submittedAt: grpcTimestamp(new Date(result.entry.submittedAt)),
      idempotentReplay: result.replayed,
    };
  }

  @GrpcMethod('AttendanceService', 'CreateManualAttendance')
  async createManualAttendance(
    request: CreateManualAttendanceRequest,
    metadata: Metadata,
  ) {
    const claims = this.authorization.claims(metadata);

    const key = this.idempotencyKey(metadata);
    const parsed = manualSchema.safeParse(request);

    if (!parsed.success) {
      failure(status.INVALID_ARGUMENT, 'VALIDATION_ERROR');
    }

    const result = await this.manualAttendance.create(
      claims.sub,
      key,
      parsed.data,
    );

    if (!result.entry.claimedAt || !result.entry.submittedAt) {
      throw new Error('manual attendance timestamps missing');
    }

    return {
      ...result.entry,
      claimedAt: grpcTimestamp(result.entry.claimedAt),
      submittedAt: grpcTimestamp(result.entry.submittedAt),
      idempotentReplay: result.replay,
    };
  }

  private idempotencyKey(metadata: Metadata) {
    const key = metadata.get('idempotency-key')[0];

    if (typeof key !== 'string' || key.length < 1 || key.length > 128) {
      failure(status.INVALID_ARGUMENT, 'IDEMPOTENCY_KEY_REQUIRED');
    }

    return key;
  }

  private clockType(value: 'CLOCK_IN' | 'CLOCK_OUT') {
    if (value === 'CLOCK_IN') {
      return ClockType.CLOCK_TYPE_CLOCK_IN;
    }

    return ClockType.CLOCK_TYPE_CLOCK_OUT;
  }

  private clockTypeName(value: ClockType) {
    if (value === ClockType.CLOCK_TYPE_CLOCK_IN) {
      return 'CLOCK_IN' as const;
    }

    return 'CLOCK_OUT' as const;
  }
}
