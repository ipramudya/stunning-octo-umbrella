import { status } from '@grpc/grpc-js';

import { AttendanceError } from '../attendance/attendance.error.js';
import type { ClockType } from './regular-attendance.entity.js';

const jakartaFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export type RegularAttendanceErrorCode =
  | 'ATTENDANCE_ALREADY_EXISTS'
  | 'ATTENDANCE_WINDOW_CLOSED'
  | 'ATTENDANCE_ZONE_INACTIVE'
  | 'CLOCK_IN_REQUIRED'
  | 'CLOCK_OUT_MUST_BE_AFTER_CLOCK_IN'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'GPS_ACCURACY_EXCEEDS_LIMIT'
  | 'OUTSIDE_ATTENDANCE_ZONE';

const regularAttendanceStatus: Record<RegularAttendanceErrorCode, status> = {
  ATTENDANCE_ALREADY_EXISTS: status.ALREADY_EXISTS,
  ATTENDANCE_WINDOW_CLOSED: status.FAILED_PRECONDITION,
  ATTENDANCE_ZONE_INACTIVE: status.FAILED_PRECONDITION,
  CLOCK_IN_REQUIRED: status.FAILED_PRECONDITION,
  CLOCK_OUT_MUST_BE_AFTER_CLOCK_IN: status.FAILED_PRECONDITION,
  DEPENDENCY_UNAVAILABLE: status.UNAVAILABLE,
  GPS_ACCURACY_EXCEEDS_LIMIT: status.FAILED_PRECONDITION,
  OUTSIDE_ATTENDANCE_ZONE: status.FAILED_PRECONDITION,
};

export class RegularAttendanceError extends AttendanceError {
  constructor(code: RegularAttendanceErrorCode) {
    super(code, regularAttendanceStatus[code]);
  }
}

export function jakartaTime(now: Date) {
  const parts = Object.fromEntries(
    jakartaFormatter
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const workDate = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    workDate,
    oracleDate: new Date(`${workDate}T00:00:00.000Z`),
    seconds:
      Number(parts.hour) * 60 * 60 +
      Number(parts.minute) * 60 +
      Number(parts.second) +
      now.getUTCMilliseconds() / 1_000,
  };
}

export function attendanceTime(now: Date, clockType: ClockType) {
  const result = jakartaTime(now);
  const [start, end] =
    clockType === 'CLOCK_IN'
      ? [8 * 60 * 60, 9 * 60 * 60]
      : [17 * 60 * 60, 18 * 60 * 60];
  if (result.seconds < start || result.seconds > end) {
    throw new RegularAttendanceError('ATTENDANCE_WINDOW_CLOSED');
  }
  return result;
}
