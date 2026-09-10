import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import {
  type HealthCheckResponse,
  HealthCheckResponse_ServingStatus,
} from '@project/contracts';

import { ReadinessService } from './readiness.service.js';

@Controller()
export class GrpcHealthController {
  constructor(private readonly readiness: ReadinessService) {}

  @GrpcMethod('Health', 'Check')
  async check(): Promise<HealthCheckResponse> {
    let status = HealthCheckResponse_ServingStatus.NOT_SERVING;
    if (await this.readiness.isReady()) {
      status = HealthCheckResponse_ServingStatus.SERVING;
    }

    return { status };
  }
}
