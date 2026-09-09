import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AttendanceQueryRepository } from './attendance-query.repository.js';
import { AttendanceQueryService } from './attendance-query.service.js';
import { AttendanceZoneRepository } from './attendance-zone.js';
import { AttendanceController } from './attendance.controller.js';
import { environmentSchema } from './config.schema.js';
import { EvidenceStore } from './evidence-store.js';
import { EvidenceRepository } from './evidence.repository.js';
import { EvidenceService } from './evidence.service.js';
import { GrpcHealthController } from './grpc-health.controller.js';
import { HealthController } from './health.controller.js';
import { ManualAttendanceRepository } from './manual-attendance.repository.js';
import { ManualAttendanceService } from './manual-attendance.service.js';
import { ManualDecisionRepository } from './manual-decision.repository.js';
import { ManualDecisionService } from './manual-decision.service.js';
import { OracleDatabase } from './oracle.js';
import { ReadinessService } from './readiness.js';
import { RegularAttendanceRepository } from './regular-attendance.repository.js';
import { RegularAttendanceService } from './regular-attendance.service.js';

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
  providers: [
    AttendanceQueryRepository,
    AttendanceQueryService,
    AttendanceZoneRepository,
    EvidenceRepository,
    EvidenceService,
    EvidenceStore,
    ManualDecisionRepository,
    ManualDecisionService,
    ManualAttendanceRepository,
    ManualAttendanceService,
    OracleDatabase,
    ReadinessService,
    RegularAttendanceRepository,
    RegularAttendanceService,
  ],
})
export class AppModule {}
