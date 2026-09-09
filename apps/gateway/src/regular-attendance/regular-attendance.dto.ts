import { z } from 'zod';

export const regularAttendanceSchema = z
  .object({
    clockType: z.enum(['CLOCK_IN', 'CLOCK_OUT']),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number(),
    evidenceUploadId: z.uuid(),
  })
  .strict();

export type RegularAttendanceDto = z.infer<typeof regularAttendanceSchema>;
