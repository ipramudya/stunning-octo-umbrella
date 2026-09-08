import { ClockType } from '@project/contracts';
import { describe, expect, it } from 'vitest';

import { manualAttendanceRequest } from './manual-attendance.contract.js';

describe('manual attendance contract', () => {
  it('maps the public request to the protobuf wire shape', () => {
    expect(
      manualAttendanceRequest({
        clockType: 'CLOCK_IN',
        workDate: '2026-09-08',
        claimedAt: '2026-09-08T01:15:00.123Z',
        address: 'Titan Center, Bintaro',
        latitude: -6.2806863,
        longitude: 106.7264211,
        reason: 'Tidak dapat melakukan absensi reguler.',
        evidenceUploadId: 'a0124287-f066-44a0-9e9d-b33c362e050f',
      }),
    ).toMatchObject({
      clockType: ClockType.CLOCK_TYPE_CLOCK_IN,
      claimedAt: { seconds: 1_788_830_100, nanos: 123_000_000 },
    });
  });
});
