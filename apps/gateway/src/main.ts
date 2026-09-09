import { randomUUID } from 'node:crypto';

import compression from '@fastify/compress';
import helmet from '@fastify/helmet';
import { HttpException, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import type { Environment } from './config/config-typedef.js';
import { ProblemFilter } from './problem/problem.filter.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: 65_536,
      genReqId: () => randomUUID(),
      trustProxy: false,
    }),
  );
  const config = app.get(ConfigService<Environment, true>);
  app.useGlobalFilters(new ProblemFilter());
  app.enableVersioning({ type: VersioningType.URI, prefix: 'api/v' });
  await app.register(compression);
  await app.register(helmet);
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request) => {
      const hasBody =
        request.headers['content-length'] !== undefined ||
        request.headers['transfer-encoding'] !== undefined;
      const contentType = request.headers['content-type']?.split(';', 1)[0];
      if (
        request.url.startsWith('/api/v1/') &&
        hasBody &&
        contentType !== 'application/json' &&
        !contentType?.endsWith('+json')
      ) {
        throw new HttpException('JSON request body required', 415);
      }
    });
  app.enableShutdownHooks();
  await app.listen(
    config.get('HTTP_PORT', { infer: true }),
    config.get('HOST', { infer: true }),
  );
}

void bootstrap();
