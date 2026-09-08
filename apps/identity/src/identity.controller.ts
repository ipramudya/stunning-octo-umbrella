import {
  type AuthorizeAccessRequest,
  type Authorization,
  type Empty,
  type LoginRequest,
  type LogoutSessionRequest,
  type RefreshSessionRequest,
  type SessionCredentials,
} from "@dexa/contracts";
import { status, Metadata } from "@grpc/grpc-js";
import { Controller } from "@nestjs/common";
import { GrpcMethod, RpcException } from "@nestjs/microservices";
import { AuthError } from "./auth.js";
import { IdentityAuthService } from "./identity.service.js";

function authorization(metadata: Metadata) {
  const value = metadata.get("authorization")[0];
  return typeof value === "string" && value.startsWith("Bearer ") ? value.slice(7) : "";
}

function failure(error: unknown): never {
  const authError =
    error instanceof AuthError
      ? error
      : new AuthError("DEPENDENCY_UNAVAILABLE", status.UNAVAILABLE);
  const metadata = new Metadata();
  metadata.set("x-error-code", authError.code);
  throw new RpcException({ code: authError.grpcStatus, details: authError.code, metadata });
}

@Controller()
export class IdentityController {
  constructor(private readonly auth: IdentityAuthService) {}

  @GrpcMethod("IdentityService", "Login")
  async login(request: LoginRequest): Promise<SessionCredentials> {
    try {
      return await this.auth.login(request.phoneNumber, request.password);
    } catch (error) {
      failure(error);
    }
  }

  @GrpcMethod("IdentityService", "RefreshSession")
  async refreshSession(request: RefreshSessionRequest): Promise<SessionCredentials> {
    try {
      return await this.auth.refresh(request.refreshToken);
    } catch (error) {
      failure(error);
    }
  }

  @GrpcMethod("IdentityService", "LogoutSession")
  async logoutSession(request: LogoutSessionRequest): Promise<Empty> {
    try {
      await this.auth.revoke(request.refreshToken);
      return {};
    } catch (error) {
      failure(error);
    }
  }

  @GrpcMethod("IdentityService", "AuthorizeAccess")
  async authorizeAccess(
    request: AuthorizeAccessRequest,
    metadata: Metadata = new Metadata(),
  ): Promise<Authorization> {
    try {
      return await this.auth.authorize(authorization(metadata), request.audiences);
    } catch (error) {
      failure(error);
    }
  }
}
