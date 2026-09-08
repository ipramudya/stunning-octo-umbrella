// Nest route handlers keep decorated request parameters explicit.
// oxlint-disable max-params
import {
  type Authorization,
  type CreateEmployeeRequest,
  type EmployeeProfile,
  type ListEmployeesRequest,
  type ListEmployeesResponse,
  TokenAudience,
  type UpdateEmployeePhoneNumberRequest,
  type UpdateEmployeeProfileRequest,
} from "@project/contracts";
import { status, Metadata, type CallOptions, type ServiceError } from "@grpc/grpc-js";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  OnModuleInit,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ClientGrpc } from "@nestjs/microservices";
import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { STATUS_CODES } from "node:http";
import { firstValueFrom, fromEvent, type Observable, takeUntil } from "rxjs";
import { cookies, publicProfile } from "./auth.controller.js";
import type { Environment } from "./config.schema.js";
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
} from "./employee.contract.js";
import { IDENTITY_HEALTH_CLIENT } from "./grpc-health.client.js";
import { RateLimiter, RateLimitError } from "./rate-limiter.js";
import { ZodValidationPipe } from "./zod-validation.pipe.js";

interface IdentityClient {
  authorizeAccess(
    request: { audiences: TokenAudience[] },
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<Authorization>;
  listEmployees(
    request: ListEmployeesRequest,
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<ListEmployeesResponse>;
  createEmployee(
    request: CreateEmployeeRequest,
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<EmployeeProfile>;
  getEmployee(
    request: { employeeId: string },
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<EmployeeProfile>;
  updateEmployeeProfile(
    request: UpdateEmployeeProfileRequest,
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<EmployeeProfile>;
  updateEmployeePhoneNumber(
    request: UpdateEmployeePhoneNumberRequest,
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<EmployeeProfile>;
  resetEmployeePassword(
    request: { employeeId: string; password: string },
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<object>;
}

type Context = ReturnType<EmployeeController["context"]>;

@Controller({ path: "hrd/employees", version: "1" })
export class EmployeeController implements OnModuleInit {
  private identity!: IdentityClient;

  constructor(
    @Inject(IDENTITY_HEALTH_CLIENT) private readonly grpc: ClientGrpc,
    private readonly config: ConfigService<Environment, true>,
    private readonly rateLimiter: RateLimiter,
  ) {}

  onModuleInit() {
    this.identity = this.grpc.getService<IdentityClient>("IdentityService");
  }

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
        ...(value.nextCursor ? { nextCursor: value.nextCursor } : {}),
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

  @Get(":employeeId")
  async get(
    @Param("employeeId", new ZodValidationPipe(employeeIdSchema)) employeeId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return publicProfile(
      await this.call(request, reply, false, (metadata, context) =>
        this.identity.getEmployee({ employeeId }, metadata, context.options),
      ),
    );
  }

  @Patch(":employeeId")
  async update(
    @Param("employeeId", new ZodValidationPipe(employeeIdSchema)) employeeId: string,
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
            clearEmail: body.email === null || body.email === "",
          },
          metadata,
          context.options,
        ),
      ),
    );
  }

  @Put(":employeeId/phone-number")
  async updatePhone(
    @Param("employeeId", new ZodValidationPipe(employeeIdSchema)) employeeId: string,
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

  @Put(":employeeId/password")
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Param("employeeId", new ZodValidationPipe(employeeIdSchema)) employeeId: string,
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
    operation: (metadata: Metadata, context: Context) => Observable<T>,
  ) {
    const context = this.context(request, reply, unsafe);
    const access = new Metadata();
    access.set("authorization", `Bearer ${cookies(request).dexa_access ?? ""}`);
    access.set("x-correlation-id", context.traceId);
    try {
      const authorization = await firstValueFrom(
        this.identity
          .authorizeAccess(
            { audiences: [TokenAudience.TOKEN_AUDIENCE_IDENTITY] },
            access,
            context.options,
          )
          .pipe(takeUntil(context.cancelled)),
      );
      await this.rateLimiter.consume({
        scope: "authenticated",
        subject: authorization.sessionId,
        maximum: 120,
        windowSeconds: 60,
      });
      const delegated = authorization.tokens.find(
        (value) => value.audience === TokenAudience.TOKEN_AUDIENCE_IDENTITY,
      )?.token;
      if (!delegated) throw new Error("missing delegated token");
      const metadata = new Metadata();
      metadata.set("authorization", `Bearer ${delegated}`);
      metadata.set("x-correlation-id", context.traceId);
      return await firstValueFrom(operation(metadata, context).pipe(takeUntil(context.cancelled)));
    } catch (error) {
      this.failure(error, request, reply, context.traceId);
    }
  }

  private context(request: FastifyRequest, reply: FastifyReply, unsafe: boolean) {
    const traceId = randomUUID();
    reply.header("x-correlation-id", traceId);
    if (unsafe && request.headers.origin !== this.config.get("APP_ORIGIN", { infer: true }))
      this.fail(403, "FORBIDDEN", "Request origin is not allowed", request, traceId);
    return {
      traceId,
      options: { deadline: Date.now() + 3_000 },
      cancelled: fromEvent(request.raw, "aborted"),
    };
  }

  private failure(
    error: unknown,
    request: FastifyRequest,
    reply: FastifyReply,
    traceId: string,
  ): never {
    if (error instanceof HttpException) throw error;
    if (error instanceof RateLimitError) {
      reply.header("retry-after", error.retryAfter);
      this.fail(429, "RATE_LIMIT_EXCEEDED", "Too many requests", request, traceId);
    }
    const serviceError = error as Partial<ServiceError>;
    const supplied = serviceError.metadata?.get("x-error-code")[0];
    const code = typeof supplied === "string" ? supplied : undefined;
    const mappings: Partial<Record<status, [number, string, string]>> = {
      [status.INVALID_ARGUMENT]: [
        400,
        code === "INVALID_CURSOR" ? code : "VALIDATION_ERROR",
        code === "INVALID_CURSOR" ? "The cursor is invalid" : "Request validation failed",
      ],
      [status.UNAUTHENTICATED]: [401, "AUTHENTICATION_REQUIRED", "Authentication is required"],
      [status.PERMISSION_DENIED]: [403, "FORBIDDEN", "HRD access is required"],
      [status.NOT_FOUND]: [404, "EMPLOYEE_NOT_FOUND", "Employee was not found"],
      [status.ALREADY_EXISTS]: [409, code ?? "VALIDATION_ERROR", "Employee data already exists"],
      [status.UNAVAILABLE]: [
        503,
        "DEPENDENCY_UNAVAILABLE",
        "The service is temporarily unavailable",
      ],
      [status.DEADLINE_EXCEEDED]: [504, "DOWNSTREAM_TIMEOUT", "The request timed out"],
    };
    const mapped = serviceError.code === undefined ? undefined : mappings[serviceError.code];
    if (mapped) this.fail(...mapped, request, traceId);
    this.fail(500, "INTERNAL_ERROR", "An unexpected error occurred", request, traceId);
  }

  private fail(
    statusCode: number,
    code: string,
    detail: string,
    request: FastifyRequest,
    traceId: string,
  ): never {
    throw new HttpException(
      {
        type: "about:blank",
        title: STATUS_CODES[statusCode] ?? "Internal Server Error",
        status: statusCode,
        detail,
        instance: request.url,
        code,
        traceId,
      },
      statusCode,
    );
  }
}
