import { describe, expect, it, vi } from 'vitest';

import { IdempotencyService } from './idempotency.service.js';

describe('IdempotencyService', () => {
  it('owns startup cleanup', async () => {
    vi.useFakeTimers();

    const connection = { execute: vi.fn().mockResolvedValue({}) };
    const database = {
      withTransaction: (work: (value: typeof connection) => unknown) =>
        work(connection),
    };
    const service = new IdempotencyService(database as never);

    try {
      await service.onApplicationBootstrap();

      expect(connection.execute).toHaveBeenCalledWith(
        expect.stringContaining("status = 'IN_PROGRESS'"),
      );
    } finally {
      service.onApplicationShutdown();
      vi.useRealTimers();
    }
  });

  it('restores a completed response', async () => {
    const connection = {
      execute: vi.fn().mockResolvedValue({
        rows: [
          {
            REQUEST_HASH: 'hash-1',
            STATUS: 'COMPLETED',
            RESPONSE_BODY: '{"id":"entry-1"}',
            CREATED_AT: new Date('2026-09-10T08:00:00.000Z'),
            EXPIRES_AT: new Date(Date.now() + 60_000),
          },
        ],
      }),
    };
    const database = {
      withTransaction: (work: (value: typeof connection) => unknown) =>
        work(connection),
    };
    const repository = new IdempotencyService(database as never);

    await expect(
      repository.claim({
        actorId: 'employee-1',
        operation: 'CREATE_ATTENDANCE',
        key: 'key-1',
        hash: 'hash-1',
        restore: (body) => JSON.parse(body) as { id: string },
      }),
    ).resolves.toMatchObject({
      kind: 'completed',
      response: { id: 'entry-1' },
    });
  });
});
