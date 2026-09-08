import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { environmentSchema } from "./config.schema.js";
import { GrpcHealthController } from "./grpc-health.controller.js";
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
  ],
  controllers: [GrpcHealthController, HealthController],
  providers: [ReadinessService],
})
export class AppModule {}
