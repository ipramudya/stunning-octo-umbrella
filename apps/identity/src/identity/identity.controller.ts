import { status, Metadata } from '@grpc/grpc-js';
import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
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

import { AuthError } from '../auth/auth-error.js';
import { EmployeeAdminService } from '../employee/employee-admin.service.js';
import { IdentityAuthService } from './identity.service.js';

@Controller()
export class IdentityController {
  private authorization(metadata: Metadata) {
    const value = metadata.get('authorization')[0];
    return typeof value === 'string' && value.startsWith('Bearer ')
      ? value.slice(7)
      : '';
  }

  private failure(error: unknown): never {
    const authError =
      error instanceof AuthError
        ? error
        : new AuthError('DEPENDENCY_UNAVAILABLE', status.UNAVAILABLE);
    const metadata = new Metadata();
    metadata.set('x-error-code', authError.code);
    throw new RpcException({
      code: authError.grpcStatus,
      details: authError.code,
      metadata,
    });
  }
  constructor(
    private readonly auth: IdentityAuthService,
    private readonly employees: EmployeeAdminService,
  ) {}

  @GrpcMethod('IdentityService', 'Login')
  async login(request: LoginRequest): Promise<SessionCredentials> {
    try {
      return await this.auth.login(request.phoneNumber, request.password);
    } catch (error) {
      this.failure(error);
    }
  }

  @GrpcMethod('IdentityService', 'RefreshSession')
  async refreshSession(
    request: RefreshSessionRequest,
  ): Promise<SessionCredentials> {
    try {
      return await this.auth.refresh(request.refreshToken);
    } catch (error) {
      this.failure(error);
    }
  }

  @GrpcMethod('IdentityService', 'LogoutSession')
  async logoutSession(request: LogoutSessionRequest): Promise<Empty> {
    try {
      await this.auth.revoke(request.refreshToken);
      return {};
    } catch (error) {
      this.failure(error);
    }
  }

  @GrpcMethod('IdentityService', 'ListEmployees')
  async listEmployees(
    request: ListEmployeesRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<ListEmployeesResponse> {
    try {
      return await this.employees.list({
        token: this.authorization(metadata),
        query: request.query,
        cursor: request.cursor,
        requestedLimit: request.limit,
      });
    } catch (error) {
      this.failure(error);
    }
  }

  @GrpcMethod('IdentityService', 'CreateEmployee')
  async createEmployee(
    request: CreateEmployeeRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<EmployeeProfile> {
    try {
      return await this.employees.create(this.authorization(metadata), request);
    } catch (error) {
      this.failure(error);
    }
  }

  @GrpcMethod('IdentityService', 'GetEmployee')
  async getEmployee(
    request: GetEmployeeRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<EmployeeProfile> {
    try {
      return await this.employees.get(
        this.authorization(metadata),
        request.employeeId,
      );
    } catch (error) {
      this.failure(error);
    }
  }

  @GrpcMethod('IdentityService', 'BatchGetEmployees')
  async batchGetEmployees(
    request: BatchGetEmployeesRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<BatchGetEmployeesResponse> {
    try {
      return {
        items: await this.employees.batchGet(
          this.authorization(metadata),
          request.employeeIds,
        ),
      };
    } catch (error) {
      this.failure(error);
    }
  }

  @GrpcMethod('IdentityService', 'UpdateEmployeeProfile')
  async updateEmployeeProfile(
    request: UpdateEmployeeProfileRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<EmployeeProfile> {
    try {
      const update: { fullName?: string; email?: string | null } = {};
      if (request.fullName !== undefined) {
        update.fullName = request.fullName;
      }
      if (request.clearEmail) {
        update.email = null;
      } else if (request.email !== undefined) {
        update.email = request.email;
      }
      return await this.employees.updateProfile(
        this.authorization(metadata),
        request.employeeId,
        update,
      );
    } catch (error) {
      this.failure(error);
    }
  }

  @GrpcMethod('IdentityService', 'UpdateEmployeePhoneNumber')
  async updateEmployeePhoneNumber(
    request: UpdateEmployeePhoneNumberRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<EmployeeProfile> {
    try {
      return await this.employees.updatePhone(
        this.authorization(metadata),
        request.employeeId,
        request.phoneNumber,
      );
    } catch (error) {
      this.failure(error);
    }
  }

  @GrpcMethod('IdentityService', 'ResetEmployeePassword')
  async resetEmployeePassword(
    request: ResetEmployeePasswordRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<Empty> {
    try {
      await this.employees.resetPassword(
        this.authorization(metadata),
        request.employeeId,
        request.password,
      );
      return {};
    } catch (error) {
      this.failure(error);
    }
  }

  @GrpcMethod('IdentityService', 'AuthorizeAccess')
  async authorizeAccess(
    request: AuthorizeAccessRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<Authorization> {
    try {
      return await this.auth.authorize(
        this.authorization(metadata),
        request.audiences,
      );
    } catch (error) {
      this.failure(error);
    }
  }
}
