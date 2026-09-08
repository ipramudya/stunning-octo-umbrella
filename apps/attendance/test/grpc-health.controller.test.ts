import { HealthCheckResponse_ServingStatus } from '@project/contracts';
import { describe, expect, it, vi } from 'vitest';

import { GrpcHealthController } from '../src/grpc-health.controller.js';
import type { ReadinessService } from '../src/readiness.js';

describe('attendance gRPC health', () => {
  it('maps dependency readiness to the standard serving status', async () => {
    const isReady = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const controller = new GrpcHealthController({
      isReady,
    } as unknown as ReadinessService);

    await expect(controller.check()).resolves.toEqual({
      status: HealthCheckResponse_ServingStatus.SERVING,
    });
    await expect(controller.check()).resolves.toEqual({
      status: HealthCheckResponse_ServingStatus.NOT_SERVING,
    });
  });
});
