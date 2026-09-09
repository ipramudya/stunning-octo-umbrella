import { status, type Metadata } from '@grpc/grpc-js';
import { Controller, UseFilters } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  DecideManualAttendanceRequest,
  GetManualAttendanceRequest,
  ListPendingManualAttendanceRequest,
} from '@project/contracts';

import { ManualDecisionService } from '../manual-decision/manual-decision.service.js';
import { AttendanceAuthorizationService } from './attendance-authorization.service.js';
import { AttendanceExceptionFilter } from './attendance-exception.filter.js';
import { failure } from './attendance.error.js';
import { grpcEntry } from './attendance.helper.js';

@Controller()
@UseFilters(AttendanceExceptionFilter)
export class AttendanceDecisionController {
  constructor(
    private readonly authorization: AttendanceAuthorizationService,
    private readonly decisions: ManualDecisionService,
  ) {}

  @GrpcMethod('AttendanceService', 'ListPendingManualAttendance')
  async listPendingManualAttendance(
    request: ListPendingManualAttendanceRequest,
    metadata: Metadata,
  ) {
    await this.authorization.authorize(metadata, ['HRD']);
    const result = await this.decisions.list(request.cursor, request.limit);
    return { ...result, items: result.items.map(grpcEntry) };
  }

  @GrpcMethod('AttendanceService', 'GetManualAttendance')
  async getManualAttendance(
    request: GetManualAttendanceRequest,
    metadata: Metadata,
  ) {
    await this.authorization.authorize(metadata, ['HRD']);
    return grpcEntry(await this.decisions.get(request.entryId));
  }

  @GrpcMethod('AttendanceService', 'DecideManualAttendance')
  async decideManualAttendance(
    request: DecideManualAttendanceRequest,
    metadata: Metadata,
  ) {
    const claims = await this.authorization.authorize(metadata, ['HRD']);
    const key = metadata.get('idempotency-key')[0];
    if (typeof key !== 'string' || key.length < 1 || key.length > 128) {
      failure(status.INVALID_ARGUMENT, 'IDEMPOTENCY_KEY_REQUIRED');
    }
    const result = await this.decisions.decide(claims.sub, key, request);
    return grpcEntry({ ...result.entry, idempotentReplay: result.replay });
  }
}
