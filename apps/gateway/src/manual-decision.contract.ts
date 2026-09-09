import { z } from 'zod';

export const pendingManualListSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PendingManualListDto = z.infer<typeof pendingManualListSchema>;

export const attendanceEntryIdSchema = z.uuid();

export const rejectManualAttendanceSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export type RejectManualAttendanceDto = z.infer<
  typeof rejectManualAttendanceSchema
>;
