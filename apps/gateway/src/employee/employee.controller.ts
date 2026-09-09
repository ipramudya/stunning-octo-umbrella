import { status, type Metadata } from '@grpc/grpc-js';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
// oxlint-disable max-params
import { TokenAudience } from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { firstValueFrom, type Observable, takeUntil } from 'rxjs';

import { publicProfile } from '../auth/auth.helper.js';
import { GatewayCallService } from '../gateway-call/gateway-call.service.js';
import type { GatewayCallContext } from '../gateway-call/gateway-call.types.js';
import { IDENTITY_CLIENT } from '../grpc-client/grpc-client.providers.js';
import type { IdentityGrpcClient } from '../grpc-client/grpc-client.types.js';
import { grpcCode, grpcErrorCode } from '../grpc-client/grpc-error.js';
import { fail } from '../problem/problem.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  createEmployeeSchema,
  type CreateEmployeeDto,
  employeeIdSchema,
  employeeListSchema,
  type EmployeeListDto,
  resetPasswordSchema,
  type ResetPasswordDto,
  updateEmployeeSchema,
  type UpdateEmployeeDto,
  updatePhoneSchema,
  type UpdatePhoneDto,
} from './employee.dto.js';

@Controller({ path: 'hrd/employees', version: '1' })
export class EmployeeController {
  constructor(
    @Inject(IDENTITY_CLIENT) private readonly identity: IdentityGrpcClient,
    private readonly gatewayCall: GatewayCallService,
  ) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(employeeListSchema)) query: EmployeeListDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.call(request, reply, false, (metadata, context) =>
      this.identity.listEmployees(
        { query: query.q, cursor: query.cursor, limit: query.limit },
        metadata,
        context.options,
      ),
    ).then((value) => ({
      items: value.items.map(publicProfile),
      pageInfo: {
        nextCursor: value.nextCursor || undefined,
        hasNextPage: value.hasNextPage,
      },
    }));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createEmployeeSchema)) body: CreateEmployeeDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return publicProfile(
      await this.call(request, reply, true, (metadata, context) =>
        this.identity.createEmployee(
          { ...body, email: body.email || undefined },
          metadata,
          context.options,
        ),
      ),
    );
  }

  @Get(':employeeId')
  async get(
    @Param('employeeId', new ZodValidationPipe(employeeIdSchema))
    employeeId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return publicProfile(
      await this.call(request, reply, false, (metadata, context) =>
        this.identity.getEmployee({ employeeId }, metadata, context.options),
      ),
    );
  }

  @Patch(':employeeId')
  async update(
    @Param('employeeId', new ZodValidationPipe(employeeIdSchema))
    employeeId: string,
    @Body(new ZodValidationPipe(updateEmployeeSchema)) body: UpdateEmployeeDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return publicProfile(
      await this.call(request, reply, true, (metadata, context) =>
        this.identity.updateEmployeeProfile(
          {
            employeeId,
            fullName: body.fullName,
            email: body.email || undefined,
            clearEmail: body.email === null || body.email === '',
          },
          metadata,
          context.options,
        ),
      ),
    );
  }

  @Put(':employeeId/phone-number')
  async updatePhone(
    @Param('employeeId', new ZodValidationPipe(employeeIdSchema))
    employeeId: string,
    @Body(new ZodValidationPipe(updatePhoneSchema)) body: UpdatePhoneDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return publicProfile(
      await this.call(request, reply, true, (metadata, context) =>
        this.identity.updateEmployeePhoneNumber(
          { employeeId, phoneNumber: body.phoneNumber },
          metadata,
          context.options,
        ),
      ),
    );
  }

  @Put(':employeeId/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Param('employeeId', new ZodValidationPipe(employeeIdSchema))
    employeeId: string,
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.call(request, reply, true, (metadata, context) =>
      this.identity.resetEmployeePassword(
        { employeeId, password: body.password },
        metadata,
        context.options,
      ),
    );
  }

  private async call<T>(
    request: FastifyRequest,
    reply: FastifyReply,
    unsafe: boolean,
    operation: (
      metadata: Metadata,
      context: GatewayCallContext,
    ) => Observable<T>,
  ) {
    return this.gatewayCall.run({
      request,
      reply,
      unsafe,
      audiences: [TokenAudience.TOKEN_AUDIENCE_IDENTITY],
      rateLimited: true,
      operation: (context) =>
        firstValueFrom(
          operation(
            context.metadata(TokenAudience.TOKEN_AUDIENCE_IDENTITY),
            context,
          ).pipe(takeUntil(context.cancelled)),
        ),
      failure: (error, traceId) => this.failure(error, request, reply, traceId),
    });
  }

  private failure(
    error: unknown,
    request: FastifyRequest,
    reply: FastifyReply,
    traceId: string,
  ): never {
    if (error instanceof HttpException) {
      throw error;
    }

    const code = grpcErrorCode(error);
    let invalidCode = 'VALIDATION_ERROR';
    let invalidDetail = 'Request validation failed';
    if (code === 'INVALID_CURSOR') {
      invalidCode = code;
      invalidDetail = 'The cursor is invalid';
    }

    const mappings: Partial<Record<status, [number, string, string]>> = {
      [status.INVALID_ARGUMENT]: [400, invalidCode, invalidDetail],
      [status.UNAUTHENTICATED]: [
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication is required',
      ],
      [status.PERMISSION_DENIED]: [403, 'FORBIDDEN', 'HRD access is required'],
      [status.NOT_FOUND]: [404, 'EMPLOYEE_NOT_FOUND', 'Employee was not found'],
      [status.ALREADY_EXISTS]: [
        409,
        code ?? 'VALIDATION_ERROR',
        'Employee data already exists',
      ],
      [status.UNAVAILABLE]: [
        503,
        'DEPENDENCY_UNAVAILABLE',
        'The service is temporarily unavailable',
      ],
      [status.DEADLINE_EXCEEDED]: [
        504,
        'DOWNSTREAM_TIMEOUT',
        'The request timed out',
      ],
    };
    const codeFromGrpc = grpcCode(error);
    let mapped;
    if (codeFromGrpc !== undefined) {
      mapped = mappings[codeFromGrpc];
    }

    if (mapped) {
      fail(...mapped, request, traceId);
    }

    fail(
      500,
      'INTERNAL_ERROR',
      'An unexpected error occurred',
      request,
      traceId,
    );
  }
}
