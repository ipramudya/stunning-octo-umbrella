import {
  ClockType,
  type CreateManualAttendanceRequest,
} from '@project/contracts';
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

export function manualAttendanceRequest(
  value: ManualAttendanceDto,
): CreateManualAttendanceRequest {
  return {
    ...value,
    clockType:
      value.clockType === 'CLOCK_IN'
        ? ClockType.CLOCK_TYPE_CLOCK_IN
        : ClockType.CLOCK_TYPE_CLOCK_OUT,
    claimedAt: new Date(value.claimedAt),
  };
}
