import { Metadata } from '@grpc/grpc-js';
import { describe, expect, it, vi } from 'vitest';

import { AttendanceQueryController } from './attendance-query.controller.js';

describe('AttendanceQueryController', () => {
  it('uses the authenticated employee for personal attendance', async () => {
    const authorization = {
      claims: vi.fn().mockReturnValue({ sub: 'employee-1' }),
    };
    const queries = { listEmployee: vi.fn().mockResolvedValue([]) };
    const controller = new AttendanceQueryController(
      authorization as never,
      queries as never,
    );

    await expect(
      controller.listEmployeeAttendance({ month: '2026-09' }, new Metadata()),
    ).resolves.toEqual({ items: [], hasNextPage: false });
    expect(authorization.claims).toHaveBeenCalledWith(expect.any(Metadata));
    expect(queries.listEmployee).toHaveBeenCalledWith('employee-1', '2026-09');
  });
});
