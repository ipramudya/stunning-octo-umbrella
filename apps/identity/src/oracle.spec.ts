import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { Environment } from './config/config-typedef.js';
import { OracleDatabase } from './oracle.js';

function subject() {
  const connection = {
    close: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
  };
  const database = new OracleDatabase({} as ConfigService<Environment, true>);

  database.getPool = vi.fn().mockResolvedValue({
    getConnection: vi.fn().mockResolvedValue(connection),
  });

  return { connection, database };
}

describe('OracleDatabase transactions', () => {
  it('commits successful work and closes the connection', async () => {
    const { connection, database } = subject();

    await expect(database.withTransaction(async () => 'value')).resolves.toBe(
      'value',
    );

    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalledOnce();
  });

  it('rolls back failed work and closes the connection', async () => {
    const { connection, database } = subject();
    const failure = new Error('failed');

    await expect(
      database.withTransaction(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalledOnce();
  });
});
