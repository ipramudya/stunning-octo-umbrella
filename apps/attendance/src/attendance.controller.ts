import type { AttendanceZone, UpdateAttendanceZoneRequest } from "@project/contracts";
import { status, Metadata } from "@grpc/grpc-js";
import { Controller } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GrpcMethod, RpcException } from "@nestjs/microservices";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { AttendanceZoneRepository } from "./attendance-zone.js";
import type { Environment } from "./config.schema.js";
import { verifyInternalAccess } from "./internal-token.js";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(500),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  radiusMeters: z.number().finite().min(50).max(5000),
  active: z.boolean(),
});

function bearer(metadata: Metadata) {
  const value = metadata.get("authorization")[0];
  return typeof value === "string" && value.startsWith("Bearer ") ? value.slice(7) : "";
}

function failure(code: number, detail: string): never {
  const metadata = new Metadata();
  metadata.set("x-error-code", detail);
  throw new RpcException({ code, details: detail, metadata });
}

@Controller()
export class AttendanceController {
  private readonly issuer: string;
  private readonly publicKey: string;

  constructor(
    private readonly zones: AttendanceZoneRepository,
    config: ConfigService<Environment, true>,
  ) {
    this.issuer = config.get("JWT_ISSUER", { infer: true });
    this.publicKey = readFileSync(
      join(config.get("PKI_DIR", { infer: true }), "identity-signing.pub"),
      "utf8",
    );
  }

  @GrpcMethod("AttendanceService", "GetAttendanceZone")
  async getAttendanceZone(_request: object, metadata: Metadata): Promise<AttendanceZone> {
    await this.authorize(metadata);
    return this.zones.get();
  }

  @GrpcMethod("AttendanceService", "UpdateAttendanceZone")
  async updateAttendanceZone(
    request: UpdateAttendanceZoneRequest,
    metadata: Metadata,
  ): Promise<AttendanceZone> {
    const claims = await this.authorize(metadata, ["HRD"]);
    const parsed = updateSchema.safeParse(request);
    if (!parsed.success) failure(status.INVALID_ARGUMENT, "VALIDATION_ERROR");
    return this.zones.update(parsed.data, claims.sub);
  }

  private async authorize(metadata: Metadata, roles: ("EMPLOYEE" | "HRD")[] = []) {
    try {
      return await verifyInternalAccess({
        token: bearer(metadata),
        publicKeyPem: this.publicKey,
        issuer: this.issuer,
        requiredRoles: roles,
      });
    } catch (error) {
      failure(
        error instanceof Error && error.message === "forbidden"
          ? status.PERMISSION_DENIED
          : status.UNAUTHENTICATED,
        error instanceof Error && error.message === "forbidden"
          ? "FORBIDDEN"
          : "AUTHENTICATION_REQUIRED",
      );
    }
  }
}
