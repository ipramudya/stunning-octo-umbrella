import { status, type Metadata } from '@grpc/grpc-js';
import { Controller, UseFilters } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import {
  ClockType,
  type CreateManualAttendanceRequest,
  type CreateRegularAttendanceRequest,
} from '@project/contracts';

import { ManualAttendanceService } from '../manual-attendance/manual-attendance.service.js';
import { RegularAttendanceService } from '../regular-attendance/regular-attendance.service.js';
import { AttendanceAuthorizationService } from './attendance-authorization.service.js';
import { AttendanceExceptionFilter } from './attendance-exception.filter.js';
import { failure } from './attendance.error.js';
import { grpcTimestamp } from './attendance.helper.js';
import { manualSchema, regularSchema } from './attendance.schema.js';

@Controller()
@UseFilters(AttendanceExceptionFilter)
export class AttendanceSubmissionController {
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

  constructor(
    private readonly authorization: AttendanceAuthorizationService,
    private readonly regularAttendance: RegularAttendanceService,
    private readonly manualAttendance: ManualAttendanceService,
  ) {}

  @GrpcMethod('AttendanceService', 'CreateRegularAttendance')
  async createRegularAttendance(
    request: CreateRegularAttendanceRequest,
    metadata: Metadata,
  ) {
    const claims = await this.authorization.authorize(metadata, ['EMPLOYEE']);
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
    const claims = await this.authorization.authorize(metadata, ['EMPLOYEE']);
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
}
