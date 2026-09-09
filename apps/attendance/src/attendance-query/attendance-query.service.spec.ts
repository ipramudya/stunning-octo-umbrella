import {
  AttendanceOrder,
  AttendanceSource,
  AttendanceStatus,
  ClockType,
} from '@project/contracts';
import { describe, expect, it, vi } from 'vitest';

import { AttendanceQueryError } from './attendance-query.error.js';
import { AttendanceQueryService } from './attendance-query.service.js';

function subject() {
  const repository = {
    listEmployee: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
  };
  return {
    repository,
    service: new AttendanceQueryService(repository as never),
  };
}

const request = {
  dateFrom: '2026-03-01',
  dateTo: '2026-03-31',
  order: AttendanceOrder.ATTENDANCE_ORDER_DESC,
  limit: 20,
};

describe('attendance queries', () => {
  it('scopes employee detail to the authenticated employee', async () => {
    const { repository, service } = subject();
    repository.get.mockResolvedValue({ id: 'entry-1' });

    await expect(service.getEmployee('employee-1', 'entry-1')).resolves.toEqual(
      { id: 'entry-1' },
    );
    expect(repository.get).toHaveBeenCalledWith('entry-1', 'employee-1');
  });

  it('rejects date ranges longer than 31 inclusive days', async () => {
    const { service } = subject();
    await expect(
      service.list({ ...request, dateTo: '2026-04-01' }),
    ).rejects.toEqual(new AttendanceQueryError('DATE_RANGE_TOO_LARGE'));
  });

  it('maps filters and an opaque cursor into a stable repository query', async () => {
    const { repository, service } = subject();
    const cursor = Buffer.from(
      JSON.stringify({
        workDate: '2026-03-15',
        submittedAt: '2026-03-15T02:00:00.000Z',
        id: 'entry-1',
      }),
    ).toString('base64url');

    await service.list({
      ...request,
      cursor,
      source: AttendanceSource.ATTENDANCE_SOURCE_MANUAL,
      status: AttendanceStatus.ATTENDANCE_STATUS_RECORDED,
      clockType: ClockType.CLOCK_TYPE_CLOCK_IN,
    });

    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'MANUAL',
        status: 'RECORDED',
        clockType: 'CLOCK_IN',
        cursor: {
          workDate: '2026-03-15',
          submittedAt: new Date('2026-03-15T02:00:00.000Z'),
          id: 'entry-1',
        },
      }),
    );
  });
});
