import compression from '@fastify/compress';
import helmet from '@fastify/helmet';
import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import type { Environment } from './config.schema.js';
import { ProblemFilter } from './problem.filter.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 65_536 }),
  );
  const config = app.get(ConfigService<Environment, true>);
  app.useGlobalFilters(new ProblemFilter());
  app.enableVersioning({ type: VersioningType.URI, prefix: 'api/v' });
  await app.register(compression);
  await app.register(helmet);
  app.enableShutdownHooks();
  await app.listen(
    config.get('HTTP_PORT', { infer: true }),
    config.get('HOST', { infer: true }),
  );
}

void bootstrap();
