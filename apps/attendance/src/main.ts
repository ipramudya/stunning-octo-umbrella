import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { Transport, type MicroserviceOptions } from "@nestjs/microservices";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { ServerCredentials } from "@grpc/grpc-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AppModule } from "./app.module.js";
import type { Environment } from "./config.js";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  const config = app.get(ConfigService<Environment, true>);
  const pkiDir = config.get("PKI_DIR", { infer: true });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      credentials: ServerCredentials.createSsl(
        readFileSync(join(pkiDir, "ca.crt")),
        [
          {
            cert_chain: readFileSync(join(pkiDir, "attendance.crt")),
            private_key: readFileSync(join(pkiDir, "attendance.key")),
          },
        ],
        true,
      ),
      package: "grpc.health.v1",
      protoPath: join(
        import.meta.dirname,
        "../../../packages/contracts/proto/grpc/health/v1/health.proto",
      ),
      url: `${config.get("HOST", { infer: true })}:${config.get("GRPC_PORT", { infer: true })}`,
    },
  });

  app.enableShutdownHooks();
  await app.startAllMicroservices();
  await app.listen(config.get("HTTP_PORT", { infer: true }), config.get("HOST", { infer: true }));
}

void bootstrap();
