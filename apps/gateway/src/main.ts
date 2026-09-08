import helmet from "@fastify/helmet";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import type { Environment } from "./config.js";
import { ProblemFilter } from "./problem.filter.js";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 65_536 }),
  );
  const config = app.get(ConfigService<Environment, true>);
  app.useGlobalFilters(new ProblemFilter());
  await app.register(helmet);
  app.enableShutdownHooks();
  await app.listen(config.get("HTTP_PORT", { infer: true }), config.get("HOST", { infer: true }));
}

void bootstrap();
