import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule } from '@nestjs/microservices';

import { AttendanceZoneController } from './attendance-zone.controller.js';
import { AuthController } from './auth.controller.js';
import { environmentSchema, type Environment } from './config.schema.js';
import { EmployeeController } from './employee.controller.js';
import {
  ATTENDANCE_HEALTH_CLIENT,
  createHealthClientOptions,
  IDENTITY_HEALTH_CLIENT,
} from './grpc-health.client.js';
import { HealthController } from './health.controller.js';
import { RateLimiter } from './rate-limiter.js';
import { ReadinessService } from './readiness.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      ignoreEnvFile: true,
      isGlobal: true,
      validate: (config) => environmentSchema.parse(config),
    }),
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
  controllers: [
    AttendanceZoneController,
    AuthController,
    EmployeeController,
    HealthController,
  ],
  providers: [RateLimiter, ReadinessService],
})
export class AppModule {}
