import { describe, expect, it } from 'vitest';

import {
  attendanceTime,
  RegularAttendanceError,
} from './regular-attendance.service.js';

describe('regular attendance time policy', () => {
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
