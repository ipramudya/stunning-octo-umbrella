import { z } from 'zod';

export const employeeAttendanceListSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

export type EmployeeAttendanceListDto = z.infer<
  typeof employeeAttendanceListSchema
>;
