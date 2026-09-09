import { Metadata } from '@grpc/grpc-js';
import { Controller, UseFilters } from '@nestjs/common';
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

import { EmployeeAdminService } from '../employee/employee-admin.service.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';
import { IdentityAuthService } from './identity.service.js';

@Controller()
@UseFilters(IdentityExceptionFilter)
export class IdentityController {
  constructor(
    private readonly auth: IdentityAuthService,
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
  listEmployees(
    request: ListEmployeesRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<ListEmployeesResponse> {
    return this.employees.list({
      token: this.authorization(metadata),
      query: request.query,
      cursor: request.cursor,
      requestedLimit: request.limit,
    });
  }

  @GrpcMethod('IdentityService', 'CreateEmployee')
  createEmployee(
    request: CreateEmployeeRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<EmployeeProfile> {
    return this.employees.create(this.authorization(metadata), request);
  }

  @GrpcMethod('IdentityService', 'GetEmployee')
  getEmployee(
    request: GetEmployeeRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<EmployeeProfile> {
    return this.employees.get(this.authorization(metadata), request.employeeId);
  }

  @GrpcMethod('IdentityService', 'BatchGetEmployees')
  async batchGetEmployees(
    request: BatchGetEmployeesRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<BatchGetEmployeesResponse> {
    return {
      items: await this.employees.batchGet(
        this.authorization(metadata),
        request.employeeIds,
      ),
    };
  }

  @GrpcMethod('IdentityService', 'UpdateEmployeeProfile')
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
      this.authorization(metadata),
      request.employeeId,
      update,
    );
  }

  @GrpcMethod('IdentityService', 'UpdateEmployeePhoneNumber')
  updateEmployeePhoneNumber(
    request: UpdateEmployeePhoneNumberRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<EmployeeProfile> {
    return this.employees.updatePhone(
      this.authorization(metadata),
      request.employeeId,
      request.phoneNumber,
    );
  }

  @GrpcMethod('IdentityService', 'ResetEmployeePassword')
  async resetEmployeePassword(
    request: ResetEmployeePasswordRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<Empty> {
    await this.employees.resetPassword(
      this.authorization(metadata),
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
    return this.auth.authorize(this.authorization(metadata), request.audiences);
  }

  private authorization(metadata: Metadata) {
    const value = metadata.get('authorization')[0];

    if (typeof value === 'string' && value.startsWith('Bearer ')) {
      return value.slice(7);
    }

    return '';
  }
}
