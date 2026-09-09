import { AttendanceStatus } from '@project/contracts';
import { describe, expect, it } from 'vitest';

import {
  attendanceStatusName,
  hasTimestamp,
  timestampIso,
} from './attendance.helper.js';

describe('attendance helpers', () => {
  it('detects and serializes supported timestamps', () => {
    const date = new Date('1970-01-01T00:00:01.500Z');

    expect(hasTimestamp(date)).toBe(true);
    expect(hasTimestamp({ seconds: 1 })).toBe(true);
    expect(hasTimestamp({})).toBe(false);
    expect(timestampIso(date)).toBe('1970-01-01T00:00:01.500Z');
    expect(timestampIso({ seconds: 1, nanos: 500_000_000 })).toBe(
      '1970-01-01T00:00:01.500Z',
    );
    expect(timestampIso({ seconds: { low: 1, high: 0 }, nanos: 0 })).toBe(
      '1970-01-01T00:00:01.000Z',
    );
    expect(() => timestampIso({ seconds: 1, nanos: 'invalid' })).toThrow(
      'invalid timestamp',
    );
  });

  it.each([
    [AttendanceStatus.ATTENDANCE_STATUS_PENDING_REVIEW, 'PENDING_REVIEW'],
    [AttendanceStatus.ATTENDANCE_STATUS_RECORDED, 'RECORDED'],
    [AttendanceStatus.ATTENDANCE_STATUS_REJECTED, 'REJECTED'],
  ])('maps attendance status %s', (status, expected) => {
    expect(attendanceStatusName(status)).toBe(expected);
  });
});
