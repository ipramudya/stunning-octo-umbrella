import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { environmentSchema } from "./config.js";
import { GrpcHealthController } from "./grpc-health.controller.js";
import { EmployeeRepository } from "./employee.repository.js";
import { HealthController } from "./health.controller.js";
import { IdentityController } from "./identity.controller.js";
import { IdentityAuthService } from "./identity.service.js";
import { OracleDatabase } from "./oracle.js";
import { ReadinessService } from "./readiness.js";
import { SessionStore } from "./session.store.js";
import { TokenService } from "./tokens.js";

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
    EmployeeRepository,
    IdentityAuthService,
    OracleDatabase,
    ReadinessService,
    SessionStore,
    TokenService,
  ],
})
export class AppModule {}
