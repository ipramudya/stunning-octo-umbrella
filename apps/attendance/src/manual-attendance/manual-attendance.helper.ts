import {
  ClockType,
  type CreateManualAttendanceRequest,
} from '@project/contracts';

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

export class ManualAttendanceError extends Error {
  constructor(readonly code: string) {
    super(code);
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
