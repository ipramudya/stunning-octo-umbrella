import { fileURLToPath } from "node:url";

export * from "./generated/grpc/health/v1/health.js";

export const HEALTH_PROTO_PATH = fileURLToPath(
  new URL("../proto/grpc/health/v1/health.proto", import.meta.url),
);
