import { HEALTH_PROTO_PATH } from "@dexa/contracts";
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
            cert_chain: readFileSync(join(pkiDir, "identity.crt")),
            private_key: readFileSync(join(pkiDir, "identity.key")),
          },
        ],
        true,
      ),
      package: "grpc.health.v1",
      protoPath: HEALTH_PROTO_PATH,
      url: `${config.get("HOST", { infer: true })}:${config.get("GRPC_PORT", { infer: true })}`,
    },
  });

  app.enableShutdownHooks();
  await app.startAllMicroservices();
  await app.listen(config.get("HTTP_PORT", { infer: true }), config.get("HOST", { infer: true }));
}

void bootstrap();
