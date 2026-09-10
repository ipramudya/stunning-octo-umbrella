import { describe, expect, it } from 'vitest';

import { attendanceEntrySchema, profileSchema } from './contracts';

const entry = {
  claimedAt: null,
  clockType: 'CLOCK_IN',
  employeeId: 'a0124287-f066-44a0-9e9d-b33c362e050f',
  evidenceId: null,
  id: '714e643a-ca28-43f5-890f-5951d1326f14',
  location: null,
  occurredAt: null,
  reason: null,
  source: 'MANUAL',
  status: 'REJECTED',
  submittedAt: '2026-03-26T08:00:00.000Z',
  workDate: '2026-03-26',
};

describe('API contracts', () => {
  it('accepts omitted optional profile and employee decision fields', () => {
    expect(
      profileSchema.parse({
        employeeNumber: 'DEXA-1',
        fullName: 'Rina Kusuma',
        id: entry.employeeId,
        phoneNumber: '+628123456789',
        roles: ['EMPLOYEE'],
      }).email,
    ).toBeUndefined();
    expect(
      attendanceEntrySchema.parse({
        ...entry,
        decision: {
          decidedAt: '2026-03-26T09:00:00.000Z',
          decidedByEmployeeId: 'e046f14f-d439-482b-9346-0c601a2f3487',
          reason: 'Tidak sesuai bukti.',
        },
      }).decision,
    ).not.toBeNull();
  });
});
