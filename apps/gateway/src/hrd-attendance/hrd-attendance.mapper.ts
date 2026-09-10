import {
  type AttendanceEntry,
  AttendanceSource,
  AttendanceStatus,
  ClockType,
  type EmployeeProfile,
} from '@project/contracts';

import {
  attendanceLocation,
  attendanceSourceName,
  attendanceStatusName,
  clockTypeName,
  optionalTimestampIso,
  timestampIso,
} from '../attendance/attendance.helper.js';
import type { AttendanceListDto } from './hrd-attendance.dto.js';

export function requireProfile(
  profiles: Map<string, EmployeeProfile>,
  employeeId: string,
) {
  const profile = profiles.get(employeeId);

  if (!profile) {
    throw new Error(`employee profile missing: ${employeeId}`);
  }

  return profile;
}

export function attendanceSource(value: AttendanceListDto['source']) {
  if (value === 'REGULAR') {
    return AttendanceSource.ATTENDANCE_SOURCE_REGULAR;
  }

  if (value === 'MANUAL') {
    return AttendanceSource.ATTENDANCE_SOURCE_MANUAL;
  }
}

export function attendanceStatus(value: AttendanceListDto['status']) {
  if (value === 'PENDING_REVIEW') {
    return AttendanceStatus.ATTENDANCE_STATUS_PENDING_REVIEW;
  }

  if (value === 'RECORDED') {
    return AttendanceStatus.ATTENDANCE_STATUS_RECORDED;
  }

  if (value === 'REJECTED') {
    return AttendanceStatus.ATTENDANCE_STATUS_REJECTED;
  }
}

export function clockType(value: AttendanceListDto['clockType']) {
  if (value === 'CLOCK_IN') {
    return ClockType.CLOCK_TYPE_CLOCK_IN;
  }

  if (value === 'CLOCK_OUT') {
    return ClockType.CLOCK_TYPE_CLOCK_OUT;
  }
}

function person(value: EmployeeProfile) {
  return {
    id: value.id,
    employeeNumber: value.employeeNumber,
    fullName: value.fullName,
  };
}

function decisionResponse(
  entry: AttendanceEntry,
  reviewer: EmployeeProfile | undefined,
) {
  if (!entry.decision || !reviewer) {
    return null;
  }

  return {
    decidedAt: timestampIso(entry.decision.decidedAt),
    reviewer: person(reviewer),
    reason: entry.decision.reason || null,
  };
}

export function attendanceEntryResponse(
  entry: AttendanceEntry,
  employee: EmployeeProfile,
  reviewer?: EmployeeProfile,
) {
  return {
    id: entry.id,
    employeeId: entry.employeeId,
    employee: person(employee),
    workDate: entry.workDate,
    clockType: clockTypeName(entry.clockType),
    source: attendanceSourceName(entry.source),
    status: attendanceStatusName(entry.status),
    occurredAt: optionalTimestampIso(entry.occurredAt),
    claimedAt: optionalTimestampIso(entry.claimedAt),
    submittedAt: timestampIso(entry.submittedAt),
    location: attendanceLocation(entry.location),
    reason: entry.reason ?? null,
    evidenceId: entry.evidenceId ?? null,
    decision: decisionResponse(entry, reviewer),
  };
}
