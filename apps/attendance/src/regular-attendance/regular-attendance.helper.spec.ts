import { describe, expect, it } from 'vitest';

import { RegularAttendanceError } from './regular-attendance.helper.js';
import { attendanceTime, jakartaTime } from './regular-attendance.helper.js';

describe('regular attendance time policy', () => {
  it('converts UTC time to Jakarta work time', () => {
    expect(jakartaTime(new Date('2026-02-01T17:00:00.500Z'))).toEqual({
      workDate: '2026-02-02',
      oracleDate: new Date('2026-02-02T00:00:00.000Z'),
      seconds: 0.5,
    });
  });

  it.each([
    ['CLOCK_IN', '2026-02-02T01:00:00.000Z'],
    ['CLOCK_IN', '2026-02-02T02:00:00.000Z'],
    ['CLOCK_OUT', '2026-02-02T10:00:00.000Z'],
    ['CLOCK_OUT', '2026-02-02T11:00:00.000Z'],
  ] as const)('accepts the inclusive %s window', (clockType, now) => {
    expect(attendanceTime(new Date(now), clockType).workDate).toBe(
      '2026-02-02',
    );
  });

  it.each([
    ['CLOCK_IN', '2026-02-02T00:59:59.000Z'],
    ['CLOCK_IN', '2026-02-02T02:00:00.001Z'],
    ['CLOCK_OUT', '2026-02-02T09:59:59.000Z'],
    ['CLOCK_OUT', '2026-02-02T11:00:00.001Z'],
  ] as const)('rejects times outside the %s window', (clockType, now) => {
    expect(() => attendanceTime(new Date(now), clockType)).toThrow(
      new RegularAttendanceError('ATTENDANCE_WINDOW_CLOSED'),
    );
  });
});
