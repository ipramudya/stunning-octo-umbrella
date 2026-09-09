import type { Metadata } from '@grpc/grpc-js';
import { Controller, UseFilters, UseGuards } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  GetAttendanceRequest,
  ListAttendanceRequest,
  ListAttendanceResponse,
  ListEmployeeAttendanceRequest,
} from '@project/contracts';

import { AttendanceQueryService } from '../attendance-query/attendance-query.service.js';
import { GrpcAuthGuard } from '../auth/grpc-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AttendanceAuthorizationService } from './attendance-authorization.service.js';
import { AttendanceExceptionFilter } from './attendance-exception.filter.js';
import { grpcEntry } from './attendance.helper.js';

@Controller()
@UseFilters(AttendanceExceptionFilter)
@UseGuards(GrpcAuthGuard, RolesGuard)
export class AttendanceQueryController {
  constructor(
    private readonly authorization: AttendanceAuthorizationService,
    private readonly queries: AttendanceQueryService,
  ) {}

  @GrpcMethod('AttendanceService', 'ListEmployeeAttendance')
  @Roles('EMPLOYEE')
  async listEmployeeAttendance(
    request: ListEmployeeAttendanceRequest,
    metadata: Metadata,
  ): Promise<ListAttendanceResponse> {
    const claims = this.authorization.claims(metadata);

    const items = await this.queries.listEmployee(claims.sub, request.month);

    return { items: items.map(grpcEntry), hasNextPage: false };
  }

  @GrpcMethod('AttendanceService', 'GetEmployeeAttendance')
  @Roles('EMPLOYEE')
  async getEmployeeAttendance(
    request: GetAttendanceRequest,
    metadata: Metadata,
  ) {
    const claims = this.authorization.claims(metadata);

    return grpcEntry(
      await this.queries.getEmployee(claims.sub, request.entryId),
    );
  }

  @GrpcMethod('AttendanceService', 'ListAttendance')
  @Roles('HRD')
  async listAttendance(request: ListAttendanceRequest, _metadata: Metadata) {
    const result = await this.queries.list(request);

    return { ...result, items: result.items.map(grpcEntry) };
  }

  @GrpcMethod('AttendanceService', 'GetAttendance')
  @Roles('HRD')
  async getAttendance(request: GetAttendanceRequest, _metadata: Metadata) {
    return grpcEntry(await this.queries.get(request.entryId));
  }
}
