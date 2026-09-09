import { ClockType } from '@project/contracts';
import { z } from 'zod';

export const manualAttendanceSchema = z.object({
  clockType: z.enum(['CLOCK_IN', 'CLOCK_OUT']),
  workDate: z.iso.date(),
  claimedAt: z.iso.datetime({ offset: true }),
  address: z.string().trim().min(1).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  reason: z.string().trim().min(1).max(1000),
  evidenceUploadId: z.uuid(),
});

export type ManualAttendanceDto = z.infer<typeof manualAttendanceSchema>;

function clockType(value: ManualAttendanceDto['clockType']) {
  if (value === 'CLOCK_IN') {
    return ClockType.CLOCK_TYPE_CLOCK_IN;
  }

  return ClockType.CLOCK_TYPE_CLOCK_OUT;
}

export function manualAttendanceRequest(value: ManualAttendanceDto) {
  const milliseconds = Date.parse(value.claimedAt);
  const claimedAt = {
    seconds: Math.floor(milliseconds / 1_000),
    nanos: (milliseconds % 1_000) * 1_000_000,
  };

  return {
    ...value,
    clockType: clockType(value.clockType),
    claimedAt,
  };
}
