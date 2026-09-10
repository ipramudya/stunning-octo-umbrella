import { Module } from '@nestjs/common';

import { AttendanceModule } from '../attendance.module.js';
import { GrpcHealthController } from './grpc-health.controller.js';
import { HealthController } from './health.controller.js';
import { ReadinessService } from './readiness.service.js';

@Module({
  imports: [AttendanceModule],
  controllers: [GrpcHealthController, HealthController],
  providers: [ReadinessService],
})
export class HealthModule {}
