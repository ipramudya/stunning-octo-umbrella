// Error mapping keeps the HTTP request context explicit.
// oxlint-disable max-params
import {
  type AttendanceZone,
  type Authorization,
  type AuthorizeEvidenceAccessRequest,
  type AuthorizeEvidenceUploadRequest,
  type EvidenceAccessAuthorization,
  type EvidenceUploadAuthorization,
  TokenAudience,
  type UpdateAttendanceZoneRequest,
} from "@project/contracts";
import { status, Metadata, type CallOptions, type ServiceError } from "@grpc/grpc-js";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  OnModuleInit,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ClientGrpc } from "@nestjs/microservices";
import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { STATUS_CODES } from "node:http";
import { firstValueFrom, fromEvent, type Observable, takeUntil } from "rxjs";
import { attendanceZoneSchema, type AttendanceZoneDto } from "./attendance-zone.contract.js";
import type { Environment } from "./config.schema.js";
import { evidenceUploadSchema, type EvidenceUploadDto } from "./evidence.contract.js";
import { ATTENDANCE_HEALTH_CLIENT, IDENTITY_HEALTH_CLIENT } from "./grpc-health.client.js";
import { ZodValidationPipe } from "./zod-validation.pipe.js";

interface IdentityClient {
  authorizeAccess(
    request: { audiences: TokenAudience[] },
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<Authorization>;
}

interface AttendanceClient {
  authorizeEvidenceUpload(
    request: AuthorizeEvidenceUploadRequest,
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<EvidenceUploadAuthorization>;
  authorizeEvidenceAccess(
    request: AuthorizeEvidenceAccessRequest,
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<EvidenceAccessAuthorization>;
  getAttendanceZone(
    request: object,
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<AttendanceZone>;
  updateAttendanceZone(
    request: UpdateAttendanceZoneRequest,
    metadata: Metadata,
    options: Partial<CallOptions>,
  ): Observable<AttendanceZone>;
}

function accessCookie(request: FastifyRequest) {
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === "dexa_access") return value.join("=");
  }
  return "";
}

function timestampIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const timestamp = value as { seconds: { toString(): string }; nanos?: number };
  return new Date(
    Number(timestamp.seconds.toString()) * 1_000 + (timestamp.nanos ?? 0) / 1_000_000,
  ).toISOString();
}

@Controller({ version: "1" })
export class AttendanceZoneController implements OnModuleInit {
  private identity!: IdentityClient;
  private attendance!: AttendanceClient;

  constructor(
    @Inject(IDENTITY_HEALTH_CLIENT) private readonly identityGrpc: ClientGrpc,
    @Inject(ATTENDANCE_HEALTH_CLIENT) private readonly attendanceGrpc: ClientGrpc,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  onModuleInit() {
    this.identity = this.identityGrpc.getService<IdentityClient>("IdentityService");
    this.attendance = this.attendanceGrpc.getService<AttendanceClient>("AttendanceService");
  }

  @Get("attendance-zone")
  get(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.call(request, reply);
  }

  @Post("me/evidence-uploads")
  async authorizeEvidenceUpload(
    @Body(new ZodValidationPipe(evidenceUploadSchema)) body: EvidenceUploadDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.status(201);
    return this.evidenceCall("upload", body, request, reply);
  }

  @Post("evidence/:evidenceId/access")
  @HttpCode(200)
  authorizeEvidenceAccess(
    @Param("evidenceId") evidenceId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.evidenceCall("access", { evidenceId }, request, reply);
  }

  @Patch("hrd/attendance-zone")
  update(
    @Body(new ZodValidationPipe(attendanceZoneSchema)) body: AttendanceZoneDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.call(request, reply, body);
  }

  private async evidenceCall(
    operation: "upload" | "access",
    body: EvidenceUploadDto | AuthorizeEvidenceAccessRequest,
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const traceId = randomUUID();
    reply.header("x-correlation-id", traceId);
    if (request.headers.origin !== this.config.get("APP_ORIGIN", { infer: true }))
      this.fail(403, "FORBIDDEN", "Request origin is not allowed", request, traceId);
    const metadata = new Metadata();
    metadata.set("authorization", `Bearer ${accessCookie(request)}`);
    metadata.set("x-correlation-id", traceId);
    const options = { deadline: Date.now() + 3_000 };
    const cancelled = fromEvent(request.raw, "aborted");
    try {
      const authorization = await firstValueFrom(
        this.identity
          .authorizeAccess(
            { audiences: [TokenAudience.TOKEN_AUDIENCE_ATTENDANCE] },
            metadata,
            options,
          )
          .pipe(takeUntil(cancelled)),
      );
      const token = authorization.tokens.find(
        (candidate) => candidate.audience === TokenAudience.TOKEN_AUDIENCE_ATTENDANCE,
      )?.token;
      if (!token) throw new Error("missing attendance token");
      metadata.set("authorization", `Bearer ${token}`);
      const response =
        operation === "upload"
          ? this.attendance.authorizeEvidenceUpload(body as EvidenceUploadDto, metadata, options)
          : this.attendance.authorizeEvidenceAccess(
              body as AuthorizeEvidenceAccessRequest,
              metadata,
              options,
            );
      const result = await firstValueFrom(response.pipe(takeUntil(cancelled)));
      return { ...result, expiresAt: timestampIso(result.expiresAt) };
    } catch (error) {
      this.grpcFailure(error, request, traceId);
    }
  }

  private async call(request: FastifyRequest, reply: FastifyReply, body?: AttendanceZoneDto) {
    const traceId = randomUUID();
    reply.header("x-correlation-id", traceId);
    if (
      body !== undefined &&
      request.headers.origin !== this.config.get("APP_ORIGIN", { infer: true })
    )
      this.fail(403, "FORBIDDEN", "Request origin is not allowed", request, traceId);

    const metadata = new Metadata();
    metadata.set("authorization", `Bearer ${accessCookie(request)}`);
    metadata.set("x-correlation-id", traceId);
    const options = { deadline: Date.now() + 3_000 };
    const cancelled = fromEvent(request.raw, "aborted");
    try {
      const authorization = await firstValueFrom(
        this.identity
          .authorizeAccess(
            { audiences: [TokenAudience.TOKEN_AUDIENCE_ATTENDANCE] },
            metadata,
            options,
          )
          .pipe(takeUntil(cancelled)),
      );
      const token = authorization.tokens.find(
        (candidate) => candidate.audience === TokenAudience.TOKEN_AUDIENCE_ATTENDANCE,
      )?.token;
      if (!token) throw new Error("missing attendance token");
      metadata.set("authorization", `Bearer ${token}`);
      return await firstValueFrom(
        (body
          ? this.attendance.updateAttendanceZone(body, metadata, options)
          : this.attendance.getAttendanceZone({}, metadata, options)
        ).pipe(takeUntil(cancelled)),
      );
    } catch (error) {
      this.grpcFailure(error, request, traceId);
    }
  }

  private grpcFailure(error: unknown, request: FastifyRequest, traceId: string): never {
    if (error instanceof HttpException) throw error;
    const code = (error as Partial<ServiceError>).code;
    if (code === status.UNAUTHENTICATED)
      this.fail(401, "AUTHENTICATION_REQUIRED", "Authentication is required", request, traceId);
    if (code === status.PERMISSION_DENIED)
      this.fail(403, "FORBIDDEN", "HRD access is required", request, traceId);
    if (code === status.INVALID_ARGUMENT)
      this.fail(400, "VALIDATION_ERROR", "Request validation failed", request, traceId);
    if (code === status.NOT_FOUND)
      this.fail(404, "EVIDENCE_NOT_FOUND", "Evidence was not found", request, traceId);
    if (code === status.FAILED_PRECONDITION) {
      const errorCode =
        ((error as ServiceError).metadata.get("x-error-code")[0] as string) ?? "EVIDENCE_INVALID";
      this.fail(409, errorCode, "Evidence is not available", request, traceId);
    }
    if (code === status.DEADLINE_EXCEEDED)
      this.fail(504, "DOWNSTREAM_TIMEOUT", "The request timed out", request, traceId);
    this.fail(
      503,
      "DEPENDENCY_UNAVAILABLE",
      "The service is temporarily unavailable",
      request,
      traceId,
    );
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
