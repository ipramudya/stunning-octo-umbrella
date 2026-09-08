import {
  type Authorization,
  type EmployeeProfile,
  type LoginRequest,
  Role,
  type SessionCredentials,
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
  Logger,
  OnModuleInit,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type ClientGrpc } from "@nestjs/microservices";
import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { STATUS_CODES } from "node:http";
import { firstValueFrom, fromEvent, type Observable, takeUntil } from "rxjs";
import { loginSchema, type LoginDto } from "./auth.contract.js";
import type { Environment } from "./config.schema.js";
import { IDENTITY_HEALTH_CLIENT } from "./grpc-health.client.js";
import { RateLimiter, RateLimitError, rateKey } from "./rate-limiter.js";
import { ZodValidationPipe } from "./zod-validation.pipe.js";

interface IdentityClient {
  login(
    request: LoginRequest,
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<SessionCredentials>;
  refreshSession(
    request: { refreshToken: string },
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<SessionCredentials>;
  logoutSession(
    request: { refreshToken: string },
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<object>;
  authorizeAccess(
    request: { audiences: never[] },
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<Authorization>;
}

function cookies(request: FastifyRequest) {
  return Object.fromEntries(
    (request.headers.cookie ?? "").split(";").flatMap((part) => {
      const index = part.indexOf("=");
      return index < 0 ? [] : [[part.slice(0, index).trim(), part.slice(index + 1)]];
    }),
  );
}

function publicProfile(value: EmployeeProfile | undefined) {
  if (!value) throw new Error("missing profile");
  return {
    id: value.id,
    employeeNumber: value.employeeNumber,
    fullName: value.fullName,
    phoneNumber: value.phoneNumber,
    ...(value.email ? { email: value.email } : {}),
    roles: value.roles.map((role) => (role === Role.ROLE_HRD ? "HRD" : "EMPLOYEE")),
  };
}

@Controller({ path: "auth", version: "1" })
export class AuthController implements OnModuleInit {
  private readonly logger = new Logger(AuthController.name);
  private identity!: IdentityClient;

  constructor(
    @Inject(IDENTITY_HEALTH_CLIENT) private readonly grpc: ClientGrpc,
    private readonly config: ConfigService<Environment, true>,
    private readonly rateLimiter: RateLimiter,
  ) {}

  onModuleInit() {
    this.identity = this.grpc.getService<IdentityClient>("IdentityService");
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const context = this.context(request, reply, true);
    await this.limit(
      "login:phone",
      rateKey(body.phoneNumber.trim()),
      5,
      900,
      request,
      reply,
      context.traceId,
    );
    await this.limit("login:ip", rateKey(request.ip), 20, 900, request, reply, context.traceId);
    try {
      const result = await firstValueFrom(
        this.identity
          .login(body, context.metadata, context.options)
          .pipe(takeUntil(context.cancelled)),
      );
      this.setCredentials(reply, result);
      return publicProfile(result.profile);
    } catch (error) {
      this.grpcFailure(error, "login", request, context.traceId);
    }
  }

  @Post("refresh")
  async refresh(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const context = this.context(request, reply, true);
    const refreshToken = cookies(request).dexa_refresh ?? "";
    await this.limit(
      "refresh:token",
      rateKey(refreshToken),
      10,
      60,
      request,
      reply,
      context.traceId,
    );
    await this.limit("refresh:ip", rateKey(request.ip), 30, 60, request, reply, context.traceId);
    try {
      const result = await firstValueFrom(
        this.identity
          .refreshSession({ refreshToken }, context.metadata, context.options)
          .pipe(takeUntil(context.cancelled)),
      );
      this.setCredentials(reply, result);
      reply.status(204);
    } catch (error) {
      this.grpcFailure(error, "refresh", request, context.traceId);
    }
  }

  @Post("logout")
  async logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const context = this.context(request, reply, true);
    try {
      await firstValueFrom(
        this.identity
          .logoutSession(
            { refreshToken: cookies(request).dexa_refresh ?? "" },
            context.metadata,
            context.options,
          )
          .pipe(takeUntil(context.cancelled)),
      );
    } catch {
      this.logger.warn(`Session revocation could not be confirmed traceId=${context.traceId}`);
    }
    reply.header("set-cookie", [
      this.cookie("dexa_access", "", "/api", 0),
      this.cookie("dexa_refresh", "", "/api/v1/auth", 0),
    ]);
    reply.status(204);
  }

  @Get("me")
  async me(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const context = this.context(request, reply, false);
    context.metadata.set("authorization", `Bearer ${cookies(request).dexa_access ?? ""}`);
    try {
      const result = await firstValueFrom(
        this.identity
          .authorizeAccess({ audiences: [] }, context.metadata, context.options)
          .pipe(takeUntil(context.cancelled)),
      );
      await this.limit("authenticated", result.sessionId, 120, 60, request, reply, context.traceId);
      return publicProfile(result.profile);
    } catch (error) {
      this.grpcFailure(error, "authorize", request, context.traceId);
    }
  }

  private context(request: FastifyRequest, reply: FastifyReply, unsafe: boolean) {
    const traceId = randomUUID();
    reply.header("x-correlation-id", traceId);
    if (unsafe && request.headers.origin !== this.config.get("APP_ORIGIN", { infer: true })) {
      this.fail(403, "FORBIDDEN", "Request origin is not allowed", request, traceId);
    }
    const metadata = new Metadata();
    metadata.set("x-correlation-id", traceId);
    return {
      metadata,
      traceId,
      options: { deadline: Date.now() + 3_000 },
      cancelled: fromEvent(request.raw, "aborted"),
    };
  }

  private async limit(
    scope: string,
    subject: string,
    maximum: number,
    windowSeconds: number,
    request: FastifyRequest,
    reply: FastifyReply,
    traceId: string,
  ) {
    try {
      await this.rateLimiter.consume(scope, subject, maximum, windowSeconds);
    } catch (error) {
      if (error instanceof RateLimitError) {
        reply.header("retry-after", error.retryAfter);
        this.fail(429, "RATE_LIMIT_EXCEEDED", "Too many requests", request, traceId);
      }
      this.fail(
        503,
        "DEPENDENCY_UNAVAILABLE",
        "The service is temporarily unavailable",
        request,
        traceId,
      );
    }
  }

  private setCredentials(reply: FastifyReply, credentials: SessionCredentials) {
    reply.header("set-cookie", [
      this.cookie("dexa_access", credentials.accessToken, "/api", 900),
      this.cookie("dexa_refresh", credentials.refreshToken, "/api/v1/auth", 604_800),
    ]);
  }

  private cookie(name: string, value: string, path: string, maxAge: number) {
    const localhost = ["localhost", "127.0.0.1"].includes(
      new URL(this.config.get("APP_ORIGIN", { infer: true })).hostname,
    );
    return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${localhost ? "" : "; Secure"}`;
  }

  private grpcFailure(
    error: unknown,
    operation: "login" | "refresh" | "authorize",
    request: FastifyRequest,
    traceId: string,
  ): never {
    if (error instanceof HttpException) throw error;
    const grpcCode = (error as Partial<ServiceError>)?.code;
    if (grpcCode === status.UNAUTHENTICATED) {
      const code = operation === "login" ? "INVALID_CREDENTIALS" : "AUTHENTICATION_REQUIRED";
      this.fail(
        401,
        code,
        operation === "login"
          ? "Phone number or password is incorrect"
          : "Authentication is required",
        request,
        traceId,
      );
    }
    if (grpcCode === status.INVALID_ARGUMENT)
      this.fail(400, "VALIDATION_ERROR", "Request validation failed", request, traceId);
    if (grpcCode === status.UNAVAILABLE)
      this.fail(
        503,
        "DEPENDENCY_UNAVAILABLE",
        "The service is temporarily unavailable",
        request,
        traceId,
      );
    if (grpcCode === status.DEADLINE_EXCEEDED)
      this.fail(504, "DOWNSTREAM_TIMEOUT", "The request timed out", request, traceId);
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
