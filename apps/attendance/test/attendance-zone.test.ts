import { describe, expect, it, vi } from 'vitest';

import {
  AttendanceConflict,
  AttendanceZoneRepository,
} from '../src/attendance-zone.js';
import type { OracleDatabase } from '../src/oracle.js';

function repository(
  execute: ReturnType<typeof vi.fn>,
  commit = vi.fn(),
  rollback = vi.fn(),
) {
  const connection = { execute, commit, rollback };
  const database = {
    withTransaction: async (
      work: (value: typeof connection) => Promise<unknown>,
    ) => {
      try {
        const result = await work(connection);
        await commit();
        return result;
      } catch (error) {
        await rollback();
        throw error;
      }
    },
  };
  return {
    repository: new AttendanceZoneRepository(
      database as unknown as OracleDatabase,
    ),
    commit,
    rollback,
  };
}

describe('attendance mutation transaction', () => {
  it('locks the zone before ordered entries and commits', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const { repository: zones, commit, rollback } = repository(execute);

    await expect(
      zones.withAttendanceMutation(
        'employee',
        new Date('2026-09-08T00:00:00Z'),
        async () => 7,
      ),
    ).resolves.toBe(7);

    expect(execute.mock.calls[0]?.[0]).toContain('attendance_zones');
    expect(execute.mock.calls[1]?.[0]).toContain('ORDER BY CASE clock_type');
    expect(commit).toHaveBeenCalledOnce();
    expect(rollback).not.toHaveBeenCalled();
  });

  it('rolls back and maps Oracle uniqueness conflicts', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const { repository: zones, commit, rollback } = repository(execute);

    await expect(
      zones.withAttendanceMutation('employee', new Date(), async () => {
        throw Object.assign(new Error('ORA-00001'), { errorNum: 1 });
      }),
    ).rejects.toBeInstanceOf(AttendanceConflict);
    expect(rollback).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });
});
