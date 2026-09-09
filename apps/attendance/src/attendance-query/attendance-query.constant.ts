import {
  AttendanceSource,
  AttendanceStatus,
  ClockType,
} from '@project/contracts';

export const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export const monthPattern = /^\d{4}-\d{2}$/;

export const attendanceSourceNames = new Map([
  [AttendanceSource.ATTENDANCE_SOURCE_REGULAR, 'REGULAR' as const],
  [AttendanceSource.ATTENDANCE_SOURCE_MANUAL, 'MANUAL' as const],
]);

export const attendanceStatusNames = new Map([
  [
    AttendanceStatus.ATTENDANCE_STATUS_PENDING_REVIEW,
    'PENDING_REVIEW' as const,
  ],
  [AttendanceStatus.ATTENDANCE_STATUS_RECORDED, 'RECORDED' as const],
  [AttendanceStatus.ATTENDANCE_STATUS_REJECTED, 'REJECTED' as const],
]);

export const clockTypeNames = new Map([
  [ClockType.CLOCK_TYPE_CLOCK_IN, 'CLOCK_IN' as const],
  [ClockType.CLOCK_TYPE_CLOCK_OUT, 'CLOCK_OUT' as const],
]);
