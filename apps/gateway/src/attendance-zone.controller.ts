import {
  type AttendanceZone,
  type Authorization,
  TokenAudience,
  type UpdateAttendanceZoneRequest,
} from "@project/contracts";
import { status, Metadata, type CallOptions, type ServiceError } from "@grpc/grpc-js";
import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  OnModuleInit,
  Patch,
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
    return this.call(request, reply, false);
  }

  @Patch("hrd/attendance-zone")
  update(
    @Body(new ZodValidationPipe(attendanceZoneSchema)) body: AttendanceZoneDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.call(request, reply, true, body);
  }

  private async call(
    request: FastifyRequest,
    reply: FastifyReply,
    unsafe: boolean,
    body?: AttendanceZoneDto,
  ) {
    const traceId = randomUUID();
    reply.header("x-correlation-id", traceId);
    if (unsafe && request.headers.origin !== this.config.get("APP_ORIGIN", { infer: true }))
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
