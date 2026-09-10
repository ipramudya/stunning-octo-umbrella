import type { Metadata } from '@grpc/grpc-js';
import { status } from '@grpc/grpc-js';
import { Controller, UseFilters, UseGuards } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  AttendanceZone,
  UpdateAttendanceZoneRequest,
} from '@project/contracts';
import { z } from 'zod';

import { AttendanceZoneRepository } from '../attendance-zone/attendance-zone.repository.js';
import { GrpcAuthGuard } from '../auth/grpc-auth.guard.js';
import { GrpcAuthorizationService } from '../auth/grpc-authorization.service.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AttendanceExceptionFilter } from './attendance-exception.filter.js';
import { failure } from './attendance.error.js';

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(50).max(5000),
  active: z.boolean(),
});

@Controller()
@UseFilters(AttendanceExceptionFilter)
@UseGuards(GrpcAuthGuard, RolesGuard)
export class AttendanceZoneController {
  constructor(
    private readonly authorization: GrpcAuthorizationService,
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
