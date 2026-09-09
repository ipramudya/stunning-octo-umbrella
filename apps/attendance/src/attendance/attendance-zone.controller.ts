import type { Metadata } from '@grpc/grpc-js';
import { status } from '@grpc/grpc-js';
import { Controller, UseFilters } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  AttendanceZone,
  UpdateAttendanceZoneRequest,
} from '@project/contracts';

import { AttendanceZoneRepository } from '../attendance-zone/attendance-zone.repository.js';
import { AttendanceAuthorizationService } from './attendance-authorization.service.js';
import { AttendanceExceptionFilter } from './attendance-exception.filter.js';
import { failure } from './attendance.error.js';
import { updateSchema } from './attendance.schema.js';

@Controller()
@UseFilters(AttendanceExceptionFilter)
export class AttendanceZoneController {
  constructor(
    private readonly authorization: AttendanceAuthorizationService,
    private readonly zones: AttendanceZoneRepository,
  ) {}

  @GrpcMethod('AttendanceService', 'GetAttendanceZone')
  async getAttendanceZone(
    _request: object,
    metadata: Metadata,
  ): Promise<AttendanceZone> {
    await this.authorization.authorize(metadata);

    return this.zones.get();
  }

  @GrpcMethod('AttendanceService', 'UpdateAttendanceZone')
  async updateAttendanceZone(
    request: UpdateAttendanceZoneRequest,
    metadata: Metadata,
  ): Promise<AttendanceZone> {
    const claims = await this.authorization.authorize(metadata, ['HRD']);

    const parsed = updateSchema.safeParse(request);

    if (!parsed.success) {
      failure(status.INVALID_ARGUMENT, 'VALIDATION_ERROR');
    }

    return this.zones.update(parsed.data, claims.sub);
  }
}
