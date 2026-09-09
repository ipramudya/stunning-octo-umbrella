import { status } from '@grpc/grpc-js';
import {
  ClockType,
  type CreateManualAttendanceRequest,
} from '@project/contracts';

import { AttendanceError } from '../attendance/attendance.error.js';

const jakartaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function jakartaDate(value: Date) {
  const parts = Object.fromEntries(
    jakartaDateFormatter
      .formatToParts(value)
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function utcDateValue(value: string) {
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number);

  return Date.UTC(year, month - 1, day);
}

export type ManualAttendanceErrorCode =
  | 'ATTENDANCE_ALREADY_EXISTS'
  | 'CLAIMED_AT_DATE_MISMATCH'
  | 'FUTURE_CLAIMED_AT'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'MANUAL_DATE_OUT_OF_RANGE'
  | 'REQUEST_IN_PROGRESS'
  | 'VALIDATION_ERROR';

const manualAttendanceStatus: Record<ManualAttendanceErrorCode, status> = {
  ATTENDANCE_ALREADY_EXISTS: status.ALREADY_EXISTS,
  CLAIMED_AT_DATE_MISMATCH: status.FAILED_PRECONDITION,
  FUTURE_CLAIMED_AT: status.FAILED_PRECONDITION,
  IDEMPOTENCY_KEY_REUSED: status.ALREADY_EXISTS,
  MANUAL_DATE_OUT_OF_RANGE: status.FAILED_PRECONDITION,
  REQUEST_IN_PROGRESS: status.ABORTED,
  VALIDATION_ERROR: status.INVALID_ARGUMENT,
};

export class ManualAttendanceError extends AttendanceError {
  constructor(code: ManualAttendanceErrorCode) {
    let retryAfterSeconds;

    if (code === 'REQUEST_IN_PROGRESS') {
      retryAfterSeconds = 1;
    }

    super(code, manualAttendanceStatus[code], retryAfterSeconds);
  }
}

export function validateManualAttendancePolicy(
  request: CreateManualAttendanceRequest,
  now: Date,
) {
  if (
    request.clockType !== ClockType.CLOCK_TYPE_CLOCK_IN &&
    request.clockType !== ClockType.CLOCK_TYPE_CLOCK_OUT
  ) {
    throw new ManualAttendanceError('VALIDATION_ERROR');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.workDate)) {
    throw new ManualAttendanceError('VALIDATION_ERROR');
  }

  const workDateNumber = utcDateValue(request.workDate);

  if (
    new Date(workDateNumber).toISOString().slice(0, 10) !== request.workDate
  ) {
    throw new ManualAttendanceError('VALIDATION_ERROR');
  }

  const today = jakartaDate(now);
  const age = (utcDateValue(today) - workDateNumber) / 86_400_000;

  if (!Number.isInteger(age) || age < 0 || age > 7) {
    throw new ManualAttendanceError('MANUAL_DATE_OUT_OF_RANGE');
  }

  if (!request.claimedAt || Number.isNaN(request.claimedAt.getTime())) {
    throw new ManualAttendanceError('VALIDATION_ERROR');
  }

  if (jakartaDate(request.claimedAt) !== request.workDate) {
    throw new ManualAttendanceError('CLAIMED_AT_DATE_MISMATCH');
  }

  if (request.claimedAt.getTime() > now.getTime()) {
    throw new ManualAttendanceError('FUTURE_CLAIMED_AT');
  }
}
