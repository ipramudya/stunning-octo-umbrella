import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ServerCredentials } from '@grpc/grpc-js';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ATTENDANCE_PROTO_PATH, HEALTH_PROTO_PATH } from '@project/contracts';

import { AppModule } from './app.module.js';
import type { Environment } from './config/config-typedef.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const config = app.get(ConfigService<Environment, true>);
  const pkiDir = config.get('PKI_DIR', { infer: true });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      gracefulShutdown: true,
      credentials: ServerCredentials.createSsl(
        readFileSync(join(pkiDir, 'ca.crt')),
        [
          {
            cert_chain: readFileSync(join(pkiDir, 'attendance.crt')),
            private_key: readFileSync(join(pkiDir, 'attendance.key')),
          },
        ],
        true,
      ),
      loader: { longs: Number },
      package: ['grpc.health.v1', 'dexa.attendance.v1'],
      protoPath: [HEALTH_PROTO_PATH, ATTENDANCE_PROTO_PATH],
      url: `${config.get('HOST', { infer: true })}:${config.get('GRPC_PORT', { infer: true })}`,
    },
  });

  app.enableShutdownHooks();
  await app.startAllMicroservices();
  await app.listen(
    config.get('HTTP_PORT', { infer: true }),
    config.get('HOST', { infer: true }),
  );
}

void bootstrap();
