import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity.module.js';
import { GrpcHealthController } from './grpc-health.controller.js';
import { HealthController } from './health.controller.js';
import { ReadinessService } from './readiness.js';

@Module({
  imports: [IdentityModule],
  controllers: [GrpcHealthController, HealthController],
  providers: [ReadinessService],
})
export class HealthModule {}
