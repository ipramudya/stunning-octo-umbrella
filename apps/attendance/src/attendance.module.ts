import { Module } from '@nestjs/common';

import { AttendanceQueryRepository } from './attendance-query/attendance-query.repository.js';
import { AttendanceQueryService } from './attendance-query/attendance-query.service.js';
import { AttendanceZoneRepository } from './attendance-zone/attendance-zone.repository.js';
import { AttendanceAuthorizationService } from './attendance/attendance-authorization.service.js';
import { AttendanceDecisionController } from './attendance/attendance-decision.controller.js';
import { AttendanceEvidenceController } from './attendance/attendance-evidence.controller.js';
import { AttendanceQueryController } from './attendance/attendance-query.controller.js';
import { AttendanceSubmissionController } from './attendance/attendance-submission.controller.js';
import { AttendanceZoneController } from './attendance/attendance-zone.controller.js';
import { GrpcAuthGuard } from './auth/grpc-auth.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { EvidenceStore } from './evidence/evidence-store.js';
import { EvidenceRepository } from './evidence/evidence.repository.js';
import { EvidenceService } from './evidence/evidence.service.js';
import { ManualAttendanceRepository } from './manual-attendance/manual-attendance.repository.js';
import { ManualAttendanceService } from './manual-attendance/manual-attendance.service.js';
import { ManualDecisionRepository } from './manual-decision/manual-decision.repository.js';
import { ManualDecisionService } from './manual-decision/manual-decision.service.js';
import { OracleDatabase } from './oracle.js';
import { RegularAttendanceRepository } from './regular-attendance/regular-attendance.repository.js';
import { RegularAttendanceService } from './regular-attendance/regular-attendance.service.js';

@Module({
  controllers: [
    AttendanceDecisionController,
    AttendanceEvidenceController,
    AttendanceQueryController,
    AttendanceSubmissionController,
    AttendanceZoneController,
  ],
  providers: [
    AttendanceAuthorizationService,
    AttendanceQueryRepository,
    AttendanceQueryService,
    AttendanceZoneRepository,
    EvidenceRepository,
    EvidenceService,
    EvidenceStore,
    GrpcAuthGuard,
    ManualDecisionRepository,
    ManualDecisionService,
    ManualAttendanceRepository,
    ManualAttendanceService,
    OracleDatabase,
    RegularAttendanceRepository,
    RegularAttendanceService,
    RolesGuard,
  ],
  exports: [EvidenceService, OracleDatabase],
})
export class AttendanceModule {}
