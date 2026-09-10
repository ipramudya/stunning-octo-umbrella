import { createServer } from 'node:net';

import { describe, expect, it, vi } from 'vitest';

import { ReadinessService } from './readiness.service.js';

describe('ReadinessService', () => {
  it('is unready until evidence recovery completes', async () => {
    const evidence = { recoveryComplete: false };
    const database = { withConnection: vi.fn() };
    const config = { get: vi.fn() };
    const service = new ReadinessService(
      config as never,
      database as never,
      evidence as never,
    );

    await expect(service.isReady()).resolves.toBe(false);
    expect(database.withConnection).not.toHaveBeenCalled();
  });

  it('is ready when MinIO and Oracle respond', async () => {
    const server = createServer();

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );

    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('No server address');
    }

    const evidence = { recoveryComplete: true };
    const database = { withConnection: vi.fn().mockResolvedValue(undefined) };
    const config = {
      get: vi.fn().mockReturnValue(`http://127.0.0.1:${address.port}`),
    };
    const service = new ReadinessService(
      config as never,
      database as never,
      evidence as never,
    );

    await expect(service.isReady()).resolves.toBe(true);
    server.close();
  });

  it('is unready when a dependency check fails', async () => {
    const evidence = { recoveryComplete: true };
    const database = {
      withConnection: vi
        .fn()
        .mockRejectedValue(new Error('Oracle unavailable')),
    };
    const config = { get: vi.fn().mockReturnValue('http://127.0.0.1:1') };
    const service = new ReadinessService(
      config as never,
      database as never,
      evidence as never,
    );

    await expect(service.isReady()).resolves.toBe(false);
  });
});
