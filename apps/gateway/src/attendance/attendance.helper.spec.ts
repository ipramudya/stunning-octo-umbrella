import { AttendanceStatus } from '@project/contracts';
import { describe, expect, it } from 'vitest';

import {
  attendanceLocation,
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
    expect(() => timestampIso({ seconds: 1, nanos: 'invalid' })).toThrow(
      'invalid timestamp',
    );
  });

  it('normalizes omitted protobuf location values', () => {
    expect(
      attendanceLocation({
        address: 'E2E Office',
        latitude: -6.28,
        longitude: 106.72,
      }),
    ).toEqual({
      accuracyMeters: null,
      address: 'E2E Office',
      distanceMeters: null,
      latitude: -6.28,
      longitude: 106.72,
    });
  });

  it.each([
    [AttendanceStatus.ATTENDANCE_STATUS_PENDING_REVIEW, 'PENDING_REVIEW'],
    [AttendanceStatus.ATTENDANCE_STATUS_RECORDED, 'RECORDED'],
    [AttendanceStatus.ATTENDANCE_STATUS_REJECTED, 'REJECTED'],
  ])('maps attendance status %s', (status, expected) => {
    expect(attendanceStatusName(status)).toBe(expected);
  });
});
