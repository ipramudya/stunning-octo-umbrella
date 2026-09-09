import type { Metadata } from '@grpc/grpc-js';
import { status } from '@grpc/grpc-js';
import { Controller, UseFilters, UseGuards } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  AttendanceZone,
  UpdateAttendanceZoneRequest,
} from '@project/contracts';

import { AttendanceZoneRepository } from '../attendance-zone/attendance-zone.repository.js';
import { GrpcAuthGuard } from '../auth/grpc-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AttendanceAuthorizationService } from './attendance-authorization.service.js';
import { AttendanceExceptionFilter } from './attendance-exception.filter.js';
import { failure } from './attendance.error.js';
import { updateSchema } from './attendance.schema.js';

@Controller()
@UseFilters(AttendanceExceptionFilter)
@UseGuards(GrpcAuthGuard, RolesGuard)
export class AttendanceZoneController {
  constructor(
    private readonly authorization: AttendanceAuthorizationService,
    private readonly zones: AttendanceZoneRepository,
  ) {}

  @GrpcMethod('AttendanceService', 'GetAttendanceZone')
  async getAttendanceZone(
    _request: object,
    _metadata: Metadata,
  ): Promise<AttendanceZone> {
    return this.zones.get();
  }

  @GrpcMethod('AttendanceService', 'UpdateAttendanceZone')
  @Roles('HRD')
  async updateAttendanceZone(
    request: UpdateAttendanceZoneRequest,
    metadata: Metadata,
  ): Promise<AttendanceZone> {
    const claims = this.authorization.claims(metadata);

    const parsed = updateSchema.safeParse(request);

    if (!parsed.success) {
      failure(status.INVALID_ARGUMENT, 'VALIDATION_ERROR');
    }

    return this.zones.update(parsed.data, claims.sub);
  }
}
