import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule } from '@nestjs/microservices';

import type { Environment } from '../config/config-typedef.js';
import {
  ATTENDANCE_HEALTH_CLIENT,
  createHealthClientOptions,
  IDENTITY_HEALTH_CLIENT,
} from '../health/grpc-health.client.js';
import {
  ATTENDANCE_CLIENT,
  grpcClientProviders,
  IDENTITY_CLIENT,
} from './grpc-client.providers.js';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: IDENTITY_HEALTH_CLIENT,
        inject: [ConfigService],
        useFactory: (config: ConfigService<Environment, true>) =>
          createHealthClientOptions({
            address: config.get('IDENTITY_GRPC_URL', { infer: true }),
            serverName: config.get('IDENTITY_GRPC_SERVER_NAME', {
              infer: true,
            }),
            pkiDir: config.get('PKI_DIR', { infer: true }),
            service: 'identity',
          }),
      },
      {
        name: ATTENDANCE_HEALTH_CLIENT,
        inject: [ConfigService],
        useFactory: (config: ConfigService<Environment, true>) =>
          createHealthClientOptions({
            address: config.get('ATTENDANCE_GRPC_URL', { infer: true }),
            serverName: config.get('ATTENDANCE_GRPC_SERVER_NAME', {
              infer: true,
            }),
            pkiDir: config.get('PKI_DIR', { infer: true }),
            service: 'attendance',
          }),
      },
    ]),
  ],
  providers: grpcClientProviders,
  exports: [ClientsModule, ATTENDANCE_CLIENT, IDENTITY_CLIENT],
})
export class GrpcClientModule {}
