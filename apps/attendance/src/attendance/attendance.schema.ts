import { ClockType } from '@project/contracts';
import { z } from 'zod';

import { protoDate } from './attendance.helper.js';

export const regularSchema = z.object({
  clockType: z.union([
    z.literal(ClockType.CLOCK_TYPE_CLOCK_IN),
    z.literal(ClockType.CLOCK_TYPE_CLOCK_OUT),
  ]),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number(),
  evidenceUploadId: z.uuid(),
});

export const manualSchema = z.object({
  clockType: z.union([
    z.literal(ClockType.CLOCK_TYPE_CLOCK_IN),
    z.literal(ClockType.CLOCK_TYPE_CLOCK_OUT),
  ]),
  workDate: z.iso.date(),
  claimedAt: z.unknown().transform(protoDate).pipe(z.date()),
  address: z.string().trim().min(1).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  reason: z.string().trim().min(1).max(1000),
  evidenceUploadId: z.uuid(),
});

export const updateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(50).max(5000),
  active: z.boolean(),
});
