import {
  AttendanceSource,
  AttendanceStatus,
  ClockType,
  type AttendanceEntry,
} from '@project/contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function hasTimestamp(value: unknown) {
  return (
    value instanceof Date ||
    (isRecord(value) && typeof value.seconds === 'number')
  );
}

export function timestampIso(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (!isRecord(value)) {
    throw new Error('invalid timestamp');
  }

  const seconds = value.seconds;
  const nanos = value.nanos ?? 0;

  if (typeof seconds !== 'number' || typeof nanos !== 'number') {
    throw new Error('invalid timestamp');
  }

  return new Date(seconds * 1_000 + nanos / 1_000_000).toISOString();
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

export function attendanceLocation(location: AttendanceEntry['location']) {
  return {
    accuracyMeters: location?.accuracyMeters ?? null,
    address: location?.address ?? null,
    distanceMeters: location?.distanceMeters ?? null,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
  };
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
