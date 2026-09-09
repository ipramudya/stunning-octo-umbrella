import { describe, expect, it, vi } from 'vitest';

import { ReadinessService } from './readiness.js';

function subject() {
  const database = { withConnection: vi.fn().mockResolvedValue(undefined) };
  const sessions = { ping: vi.fn().mockResolvedValue('PONG') };
  return {
    database,
    sessions,
    service: new ReadinessService(database as never, sessions as never),
  };
}

describe('ReadinessService', () => {
  it('is ready when Oracle and Redis respond', async () => {
    const { service, database, sessions } = subject();

    await expect(service.isReady()).resolves.toBe(true);
    expect(database.withConnection).toHaveBeenCalledOnce();
    expect(sessions.ping).toHaveBeenCalledOnce();
  });

  it('is unready when a dependency check fails', async () => {
    const { service, sessions } = subject();
    sessions.ping.mockRejectedValue(new Error('redis unavailable'));

    await expect(service.isReady()).resolves.toBe(false);
  });
});
