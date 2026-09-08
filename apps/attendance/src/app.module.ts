import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AttendanceController } from "./attendance.controller.js";
import { AttendanceZoneRepository } from "./attendance-zone.js";
import { environmentSchema } from "./config.schema.js";
import { GrpcHealthController } from "./grpc-health.controller.js";
import { HealthController } from "./health.controller.js";
import { OracleDatabase } from "./oracle.js";
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
  controllers: [AttendanceController, GrpcHealthController, HealthController],
  providers: [AttendanceZoneRepository, OracleDatabase, ReadinessService],
})
export class AppModule {}
