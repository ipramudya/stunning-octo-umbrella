import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SessionStore } from './auth/session.store.js';
import { TokenService } from './auth/tokens.js';
import { environmentSchema } from './config/config-typedef.js';
import { EmployeeAdminService } from './employee/employee-admin.service.js';
import { EmployeeRepository } from './employee/employee.repository.js';
import { GrpcHealthController } from './health/grpc-health.controller.js';
import { HealthController } from './health/health.controller.js';
import { ReadinessService } from './health/readiness.js';
import { IdentityController } from './identity/identity.controller.js';
import { IdentityAuthService } from './identity/identity.service.js';
import { OracleDatabase } from './oracle.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      ignoreEnvFile: true,
      isGlobal: true,
      validate: (config) => environmentSchema.parse(config),
    }),
  ],
  controllers: [GrpcHealthController, HealthController, IdentityController],
  providers: [
    EmployeeAdminService,
    EmployeeRepository,
    IdentityAuthService,
    OracleDatabase,
    ReadinessService,
    SessionStore,
    TokenService,
  ],
})
export class AppModule {}
