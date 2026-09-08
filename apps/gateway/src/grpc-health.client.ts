import { ChannelCredentials } from "@grpc/grpc-js";
import { Transport, type GrpcOptions } from "@nestjs/microservices";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ATTENDANCE_HEALTH_CLIENT = Symbol("ATTENDANCE_HEALTH_CLIENT");
export const IDENTITY_HEALTH_CLIENT = Symbol("IDENTITY_HEALTH_CLIENT");

export function createHealthClientOptions(
  address: string,
  serverName: string,
  pkiDir: string,
): GrpcOptions {
  return {
    transport: Transport.GRPC,
    options: {
      channelOptions: {
        "grpc.default_authority": serverName,
        "grpc.ssl_target_name_override": serverName,
      },
      credentials: ChannelCredentials.createSsl(
        readFileSync(join(pkiDir, "ca.crt")),
        readFileSync(join(pkiDir, "gateway.key")),
        readFileSync(join(pkiDir, "gateway.crt")),
      ),
      package: "grpc.health.v1",
      protoPath: join(
        import.meta.dirname,
        "../../../packages/contracts/proto/grpc/health/v1/health.proto",
      ),
      url: address,
    },
  };
}
