import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClientsModule } from "@nestjs/microservices";
import { AuthController } from "./auth.controller.js";
import { environmentSchema, type Environment } from "./config.js";
import {
  ATTENDANCE_HEALTH_CLIENT,
  createHealthClientOptions,
  IDENTITY_HEALTH_CLIENT,
} from "./grpc-health.client.js";
import { HealthController } from "./health.controller.js";
import { ReadinessService } from "./readiness.js";

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
          createHealthClientOptions(
            config.get("IDENTITY_GRPC_URL", { infer: true }),
            config.get("IDENTITY_GRPC_SERVER_NAME", { infer: true }),
            config.get("PKI_DIR", { infer: true }),
            true,
          ),
      },
      {
        name: ATTENDANCE_HEALTH_CLIENT,
        inject: [ConfigService],
        useFactory: (config: ConfigService<Environment, true>) =>
          createHealthClientOptions(
            config.get("ATTENDANCE_GRPC_URL", { infer: true }),
            config.get("ATTENDANCE_GRPC_SERVER_NAME", { infer: true }),
            config.get("PKI_DIR", { infer: true }),
          ),
      },
    ]),
  ],
  controllers: [AuthController, HealthController],
  providers: [ReadinessService],
})
export class AppModule {}
