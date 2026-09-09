import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AttendanceQueryRepository } from './attendance-query/attendance-query.repository.js';
import { AttendanceQueryService } from './attendance-query/attendance-query.service.js';
import { AttendanceZoneRepository } from './attendance-zone/attendance-zone.repository.js';
import { AttendanceController } from './attendance/attendance.controller.js';
import { environmentSchema } from './config/config-typedef.js';
import { EvidenceStore } from './evidence/evidence-store.js';
import { EvidenceRepository } from './evidence/evidence.repository.js';
import { EvidenceService } from './evidence/evidence.service.js';
import { GrpcHealthController } from './health/grpc-health.controller.js';
import { HealthController } from './health/health.controller.js';
import { ReadinessService } from './health/readiness.js';
import { ManualAttendanceRepository } from './manual-attendance/manual-attendance.repository.js';
import { ManualAttendanceService } from './manual-attendance/manual-attendance.service.js';
import { ManualDecisionRepository } from './manual-decision/manual-decision.repository.js';
import { ManualDecisionService } from './manual-decision/manual-decision.service.js';
import { OracleDatabase } from './oracle.js';
import { RegularAttendanceRepository } from './regular-attendance/regular-attendance.repository.js';
import { RegularAttendanceService } from './regular-attendance/regular-attendance.service.js';

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
