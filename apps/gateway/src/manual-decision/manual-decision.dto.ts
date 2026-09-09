import { z } from 'zod';

export const pendingManualListSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PendingManualListDto = z.infer<typeof pendingManualListSchema>;

function currentJakartaMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts();
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return {
    dateFrom: `${prefix}-01`,
    dateTo: `${prefix}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`,
  };
}

const defaultRange = currentJakartaMonth();

export const attendanceListSchema = z.object({
  dateFrom: z.iso.date().default(defaultRange.dateFrom),
  dateTo: z.iso.date().default(defaultRange.dateTo),
  employeeId: z.uuid().optional(),
  source: z.enum(['REGULAR', 'MANUAL']).optional(),
  status: z.enum(['PENDING_REVIEW', 'RECORDED', 'REJECTED']).optional(),
  clockType: z.enum(['CLOCK_IN', 'CLOCK_OUT']).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AttendanceListDto = z.infer<typeof attendanceListSchema>;

export const rejectManualAttendanceSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export type RejectManualAttendanceDto = z.infer<
  typeof rejectManualAttendanceSchema
>;
