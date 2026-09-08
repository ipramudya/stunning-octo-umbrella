import { z } from 'zod';

export const attendanceZoneSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(50).max(5000),
  active: z.boolean(),
});

export type AttendanceZoneDto = z.infer<typeof attendanceZoneSchema>;
