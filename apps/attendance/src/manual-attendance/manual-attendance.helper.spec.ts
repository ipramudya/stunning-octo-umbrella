import { ClockType } from '@project/contracts';
import { describe, expect, it } from 'vitest';

import { validateManualAttendancePolicy } from './manual-attendance.helper.js';

const now = new Date('2026-09-08T03:00:00.000Z');
const request = {
  clockType: ClockType.CLOCK_TYPE_CLOCK_OUT,
  workDate: '2026-09-08',
  claimedAt: new Date('2026-09-08T01:15:00.000Z'),
  address: 'Titan Center, Bintaro',
  latitude: -6.2806863,
  longitude: 106.7264211,
  reason: 'Tidak dapat melakukan absensi reguler.',
  evidenceUploadId: 'a0124287-f066-44a0-9e9d-b33c362e050f',
};

describe('manual attendance policy', () => {
  it('accepts a claim within the Jakarta date and seven-day policy', () => {
    expect(() => validateManualAttendancePolicy(request, now)).not.toThrow();
  });

  it.each([
    [
      { workDate: '2026-08-31', claimedAt: new Date('2026-08-31T01:00:00Z') },
      'MANUAL_DATE_OUT_OF_RANGE',
    ],
    [{ workDate: '2026-02-31' }, 'VALIDATION_ERROR'],
    [{ claimedAt: new Date('2026-09-08T04:00:00Z') }, 'FUTURE_CLAIMED_AT'],
    [
      { claimedAt: new Date('2026-09-07T16:00:00Z') },
      'CLAIMED_AT_DATE_MISMATCH',
    ],
  ])('rejects invalid policy input', (override, code) => {
    expect(() =>
      validateManualAttendancePolicy({ ...request, ...override }, now),
    ).toThrowError(expect.objectContaining({ code }));
  });
});
