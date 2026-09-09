import { Module } from '@nestjs/common';

import { GrpcClientModule } from '../grpc-client/grpc-client.module.js';
import { HealthController } from './health.controller.js';
import { ReadinessService } from './readiness.js';

@Module({
  imports: [GrpcClientModule],
  controllers: [HealthController],
  providers: [ReadinessService],
})
export class HealthModule {}
