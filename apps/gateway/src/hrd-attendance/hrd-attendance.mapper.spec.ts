import {
  AttendanceSource,
  AttendanceStatus,
  ClockType,
} from '@project/contracts';
import { describe, expect, it } from 'vitest';

import { attendanceEntryResponse } from './hrd-attendance.mapper.js';

describe('HRD attendance response mapping', () => {
  it('maps an attendance entry without leaking transport enums', () => {
    const submittedAt = new Date('2026-09-09T08:00:00.000Z');

    expect(
      attendanceEntryResponse(
        {
          id: 'entry-1',
          employeeId: 'employee-1',
          workDate: '2026-09-09',
          clockType: ClockType.CLOCK_TYPE_CLOCK_IN,
          source: AttendanceSource.ATTENDANCE_SOURCE_MANUAL,
          status: AttendanceStatus.ATTENDANCE_STATUS_PENDING_REVIEW,
          submittedAt,
          location: { latitude: -6.2, longitude: 106.8 },
          idempotentReplay: false,
        },
        {
          id: 'employee-1',
          employeeNumber: 'EMP-001',
          fullName: 'Employee One',
          phoneNumber: '+6280000000001',
          roles: [],
        },
      ),
    ).toMatchObject({
      id: 'entry-1',
      employee: { employeeNumber: 'EMP-001', fullName: 'Employee One' },
      clockType: 'CLOCK_IN',
      source: 'MANUAL',
      status: 'PENDING_REVIEW',
      submittedAt: '2026-09-09T08:00:00.000Z',
      decision: null,
    });
  });
});
