import { Module } from '@nestjs/common';

import { AttendanceHistoryController } from './attendance-history/attendance-history.controller.js';
import { AttendanceZoneController } from './attendance-zone/attendance-zone.controller.js';
import { AuthController } from './auth/auth.controller.js';
import { EmployeeController } from './employee/employee.controller.js';
import { EvidenceController } from './evidence/evidence.controller.js';
import { GatewayCallService } from './gateway-call/gateway-call.service.js';
import { GrpcClientModule } from './grpc-client/grpc-client.module.js';
import { HrdAttendanceController } from './hrd-attendance/hrd-attendance.controller.js';
import { ManualAttendanceController } from './manual-attendance/manual-attendance.controller.js';
import { RateLimiter } from './rate-limit/rate-limiter.js';
import { RegularAttendanceController } from './regular-attendance/regular-attendance.controller.js';

@Module({
  imports: [GrpcClientModule],
  controllers: [
    AttendanceHistoryController,
    AttendanceZoneController,
    AuthController,
    EmployeeController,
    EvidenceController,
    HrdAttendanceController,
    ManualAttendanceController,
    RegularAttendanceController,
  ],
  providers: [GatewayCallService, RateLimiter],
})
export class GatewayModule {}
