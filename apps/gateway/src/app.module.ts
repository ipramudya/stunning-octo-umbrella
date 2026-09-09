import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule } from '@nestjs/microservices';

import { AttendanceHistoryController } from './attendance-history/attendance-history.controller.js';
import { AttendanceZoneController } from './attendance-zone/attendance-zone.controller.js';
import { AuthController } from './auth/auth.controller.js';
import {
  environmentSchema,
  type Environment,
} from './config/config-typedef.js';
import { EmployeeController } from './employee/employee.controller.js';
import { GatewayCallService } from './gateway-call/gateway-call.service.js';
import {
  ATTENDANCE_HEALTH_CLIENT,
  createHealthClientOptions,
  IDENTITY_HEALTH_CLIENT,
} from './health/grpc-health.client.js';
import { HealthController } from './health/health.controller.js';
import { ReadinessService } from './health/readiness.js';
import { ManualAttendanceController } from './manual-attendance/manual-attendance.controller.js';
import { ManualDecisionController } from './manual-decision/manual-decision.controller.js';
import { RateLimiter } from './rate-limit/rate-limiter.js';

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
    AttendanceHistoryController,
    AttendanceZoneController,
    AuthController,
    EmployeeController,
    HealthController,
    ManualAttendanceController,
    ManualDecisionController,
  ],
  providers: [GatewayCallService, RateLimiter, ReadinessService],
})
export class AppModule {}
