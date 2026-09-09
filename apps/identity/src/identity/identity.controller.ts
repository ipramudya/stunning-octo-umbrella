import { Metadata } from '@grpc/grpc-js';
import { Controller, UseFilters, UseGuards } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import {
  type AuthorizeAccessRequest,
  type Authorization,
  type BatchGetEmployeesRequest,
  type BatchGetEmployeesResponse,
  type CreateEmployeeRequest,
  type EmployeeProfile,
  type Empty,
  type GetEmployeeRequest,
  type ListEmployeesRequest,
  type ListEmployeesResponse,
  type LoginRequest,
  type LogoutSessionRequest,
  type RefreshSessionRequest,
  type ResetEmployeePasswordRequest,
  type SessionCredentials,
  type UpdateEmployeePhoneNumberRequest,
  type UpdateEmployeeProfileRequest,
} from '@project/contracts';

import { GrpcAuthGuard } from '../auth/grpc-auth.guard.js';
import { GrpcAuthorizationService } from '../auth/grpc-authorization.service.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { EmployeeAdminService } from '../employee/employee-admin.service.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';
import { IdentityAuthService } from './identity.service.js';

@Controller()
@UseFilters(IdentityExceptionFilter)
export class IdentityController {
  constructor(
    private readonly auth: IdentityAuthService,
    private readonly authorization: GrpcAuthorizationService,
    private readonly employees: EmployeeAdminService,
  ) {}

  @GrpcMethod('IdentityService', 'Login')
  login(request: LoginRequest): Promise<SessionCredentials> {
    return this.auth.login(request.phoneNumber, request.password);
  }

  @GrpcMethod('IdentityService', 'RefreshSession')
  refreshSession(request: RefreshSessionRequest): Promise<SessionCredentials> {
    return this.auth.refresh(request.refreshToken);
  }

  @GrpcMethod('IdentityService', 'LogoutSession')
  async logoutSession(request: LogoutSessionRequest): Promise<Empty> {
    await this.auth.revoke(request.refreshToken);

    return {};
  }

  @GrpcMethod('IdentityService', 'ListEmployees')
  @UseGuards(GrpcAuthGuard, RolesGuard)
  @Roles('HRD')
  listEmployees(
    request: ListEmployeesRequest,
    _metadata: Metadata = new Metadata(),
  ): Promise<ListEmployeesResponse> {
    return this.employees.list({
      query: request.query,
      cursor: request.cursor,
      requestedLimit: request.limit,
    });
  }

  @GrpcMethod('IdentityService', 'CreateEmployee')
  @UseGuards(GrpcAuthGuard, RolesGuard)
  @Roles('HRD')
  createEmployee(
    request: CreateEmployeeRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<EmployeeProfile> {
    return this.employees.create(
      this.authorization.claims(metadata).sub,
      request,
    );
  }

  @GrpcMethod('IdentityService', 'GetEmployee')
  @UseGuards(GrpcAuthGuard, RolesGuard)
  @Roles('HRD')
  getEmployee(
    request: GetEmployeeRequest,
    _metadata: Metadata = new Metadata(),
  ): Promise<EmployeeProfile> {
    return this.employees.get(request.employeeId);
  }

  @GrpcMethod('IdentityService', 'BatchGetEmployees')
  @UseGuards(GrpcAuthGuard, RolesGuard)
  @Roles('HRD')
  async batchGetEmployees(
    request: BatchGetEmployeesRequest,
    _metadata: Metadata = new Metadata(),
  ): Promise<BatchGetEmployeesResponse> {
    return {
      items: await this.employees.batchGet(request.employeeIds),
    };
  }

  @GrpcMethod('IdentityService', 'UpdateEmployeeProfile')
  @UseGuards(GrpcAuthGuard, RolesGuard)
  @Roles('HRD')
  updateEmployeeProfile(
    request: UpdateEmployeeProfileRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<EmployeeProfile> {
    const update: { fullName?: string; email?: string | null } = {};

    if (request.fullName !== undefined) {
      update.fullName = request.fullName;
    }

    if (request.clearEmail) {
      update.email = null;
    } else if (request.email !== undefined) {
      update.email = request.email;
    }

    return this.employees.updateProfile(
      this.authorization.claims(metadata).sub,
      request.employeeId,
      update,
    );
  }

  @GrpcMethod('IdentityService', 'UpdateEmployeePhoneNumber')
  @UseGuards(GrpcAuthGuard, RolesGuard)
  @Roles('HRD')
  updateEmployeePhoneNumber(
    request: UpdateEmployeePhoneNumberRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<EmployeeProfile> {
    return this.employees.updatePhone(
      this.authorization.claims(metadata).sub,
      request.employeeId,
      request.phoneNumber,
    );
  }

  @GrpcMethod('IdentityService', 'ResetEmployeePassword')
  @UseGuards(GrpcAuthGuard, RolesGuard)
  @Roles('HRD')
  async resetEmployeePassword(
    request: ResetEmployeePasswordRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<Empty> {
    await this.employees.resetPassword(
      this.authorization.claims(metadata).sub,
      request.employeeId,
      request.password,
    );

    return {};
  }

  @GrpcMethod('IdentityService', 'AuthorizeAccess')
  authorizeAccess(
    request: AuthorizeAccessRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<Authorization> {
    return this.auth.authorize(this.externalToken(metadata), request.audiences);
  }

  private externalToken(metadata: Metadata) {
    const value = metadata.get('authorization')[0];

    if (typeof value === 'string' && value.startsWith('Bearer ')) {
      return value.slice(7);
    }

    return '';
  }
}
