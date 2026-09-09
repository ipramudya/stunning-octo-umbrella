import type { Metadata } from '@grpc/grpc-js';
import { Controller, UseFilters } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  GetAttendanceRequest,
  ListAttendanceRequest,
  ListAttendanceResponse,
  ListEmployeeAttendanceRequest,
} from '@project/contracts';

import { AttendanceQueryService } from '../attendance-query/attendance-query.service.js';
import { AttendanceAuthorizationService } from './attendance-authorization.service.js';
import { AttendanceExceptionFilter } from './attendance-exception.filter.js';
import { grpcEntry } from './attendance.helper.js';

@Controller()
@UseFilters(AttendanceExceptionFilter)
export class AttendanceQueryController {
  constructor(
    private readonly authorization: AttendanceAuthorizationService,
    private readonly queries: AttendanceQueryService,
  ) {}

  @GrpcMethod('AttendanceService', 'ListEmployeeAttendance')
  async listEmployeeAttendance(
    request: ListEmployeeAttendanceRequest,
    metadata: Metadata,
  ): Promise<ListAttendanceResponse> {
    const claims = await this.authorization.authorize(metadata, ['EMPLOYEE']);
    const items = await this.queries.listEmployee(claims.sub, request.month);
    return { items: items.map(grpcEntry), hasNextPage: false };
  }

  @GrpcMethod('AttendanceService', 'GetEmployeeAttendance')
  async getEmployeeAttendance(
    request: GetAttendanceRequest,
    metadata: Metadata,
  ) {
    const claims = await this.authorization.authorize(metadata, ['EMPLOYEE']);
    return grpcEntry(
      await this.queries.getEmployee(claims.sub, request.entryId),
    );
  }

  @GrpcMethod('AttendanceService', 'ListAttendance')
  async listAttendance(request: ListAttendanceRequest, metadata: Metadata) {
    await this.authorization.authorize(metadata, ['HRD']);
    const result = await this.queries.list(request);
    return { ...result, items: result.items.map(grpcEntry) };
  }

  @GrpcMethod('AttendanceService', 'GetAttendance')
  async getAttendance(request: GetAttendanceRequest, metadata: Metadata) {
    await this.authorization.authorize(metadata, ['HRD']);
    return grpcEntry(await this.queries.get(request.entryId));
  }
}
