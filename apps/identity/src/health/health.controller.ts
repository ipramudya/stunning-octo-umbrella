import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { ReadinessService } from './readiness.js';

@Controller('health')
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    if (!(await this.readiness.isReady())) {
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }

    return { status: 'ready' };
  }
}
