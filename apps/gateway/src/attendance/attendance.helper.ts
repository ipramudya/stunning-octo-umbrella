import {
  AttendanceSource,
  AttendanceStatus,
  ClockType,
} from '@project/contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function timestampSeconds(value: unknown) {
  if (
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'bigint'
  ) {
    return Number(value);
  }
  if (
    isRecord(value) &&
    typeof value.low === 'number' &&
    typeof value.high === 'number'
  ) {
    return value.high * 0x1_0000_0000 + (value.low >>> 0);
  }
  throw new Error('invalid timestamp');
}

export function hasTimestamp(value: unknown) {
  return (
    value instanceof Date || (isRecord(value) && value.seconds !== undefined)
  );
}

export function timestampIso(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (!isRecord(value)) {
    throw new Error('invalid timestamp');
  }
  const nanos = value.nanos;
  if (nanos !== undefined && typeof nanos !== 'number') {
    throw new Error('invalid timestamp');
  }
  return new Date(
    timestampSeconds(value.seconds) * 1_000 + (nanos ?? 0) / 1_000_000,
  ).toISOString();
}

export function clockTypeName(clockType: ClockType) {
  if (clockType === ClockType.CLOCK_TYPE_CLOCK_IN) {
    return 'CLOCK_IN' as const;
  }
  return 'CLOCK_OUT' as const;
}

export function attendanceSourceName(source: AttendanceSource) {
  if (source === AttendanceSource.ATTENDANCE_SOURCE_MANUAL) {
    return 'MANUAL' as const;
  }
  return 'REGULAR' as const;
}

export function optionalTimestampIso(value: unknown) {
  if (hasTimestamp(value)) {
    return timestampIso(value);
  }
  return null;
}

export function attendanceStatusName(status: AttendanceStatus) {
  if (status === AttendanceStatus.ATTENDANCE_STATUS_PENDING_REVIEW) {
    return 'PENDING_REVIEW' as const;
  }
  if (status === AttendanceStatus.ATTENDANCE_STATUS_RECORDED) {
    return 'RECORDED' as const;
  }
  return 'REJECTED' as const;
}
