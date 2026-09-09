import type { ClockType } from './regular-attendance.entity.js';
import { RegularAttendanceError } from './regular-attendance.error.js';

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
