import { fileURLToPath } from "node:url";

export * from "./generated/grpc/health/v1/health.js";
export {
  type AudienceToken,
  type Authorization,
  type AuthorizeAccessRequest,
  type EmployeeProfile,
  type IdentityServiceClient,
  IdentityServiceService,
  type LoginRequest,
  type LogoutSessionRequest,
  type RefreshSessionRequest,
  Role,
  type SessionCredentials,
  TokenAudience,
} from "./generated/dexa/identity/v1/identity.js";
export { type Empty } from "./generated/google/protobuf/empty.js";

export const IDENTITY_PROTO_PATH = fileURLToPath(
  new URL("../proto/dexa/identity/v1/identity.proto", import.meta.url),
);

export const HEALTH_PROTO_PATH = fileURLToPath(
  new URL("../proto/grpc/health/v1/health.proto", import.meta.url),
);
