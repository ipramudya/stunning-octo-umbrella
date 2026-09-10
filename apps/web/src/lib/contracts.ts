import { z } from 'zod';

const personSchema = z.object({
  employeeNumber: z.string(),
  fullName: z.string(),
  id: z.uuid(),
});

export const profileSchema = z.object({
  email: z.string().nullish(),
  employeeNumber: z.string(),
  fullName: z.string(),
  id: z.uuid(),
  phoneNumber: z.string(),
  roles: z.array(z.enum(['EMPLOYEE', 'HRD'])),
});

export const createEmployeeSchema = z.object({
  email: z.union([z.literal(''), z.email('Email tidak valid.')]).optional(),
  employeeNumber: z.string().trim().min(1).max(32),
  fullName: z.string().trim().min(1).max(120),
  password: z.string().min(12, 'Kata sandi minimal 12 karakter.').max(128),
  phoneNumber: z
    .string()
    .regex(/^\+62[0-9]+$/u, 'Gunakan nomor Indonesia dengan awalan +62.'),
});

export const updateEmployeeSchema = z.object({
  email: z.union([z.literal(''), z.email('Email tidak valid.')]).nullable(),
  fullName: z.string().trim().min(1).max(120),
});
export const updatePhoneSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+62[0-9]+$/u, 'Gunakan nomor Indonesia dengan awalan +62.'),
});
export const resetPasswordSchema = z.object({
  password: z.string().min(12, 'Kata sandi minimal 12 karakter.').max(128),
});

export const employeeListSchema = z.object({
  items: z.array(profileSchema),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    nextCursor: z.string().optional(),
  }),
});

export const attendanceEntrySchema = z.object({
  claimedAt: z.string().nullable(),
  clockType: z.enum(['CLOCK_IN', 'CLOCK_OUT']),
  decision: z
    .object({
      decidedAt: z.string(),
      decidedByEmployeeId: z.uuid().optional(),
      reason: z.string().nullable(),
      reviewer: personSchema.optional(),
    })
    .nullable(),
  employee: personSchema.optional(),
  employeeId: z.uuid(),
  evidenceId: z.uuid().nullable(),
  id: z.uuid(),
  location: z
    .object({
      accuracyMeters: z.number().nullable(),
      address: z.string().nullable(),
      distanceMeters: z.number().nullable(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
    })
    .nullable(),
  occurredAt: z.string().nullable(),
  reason: z.string().nullable(),
  source: z.enum(['REGULAR', 'MANUAL']),
  status: z.enum(['PENDING_REVIEW', 'RECORDED', 'REJECTED']),
  submittedAt: z.string(),
  workDate: z.iso.date(),
});

export const employeeAttendanceListSchema = z.object({
  items: z.array(attendanceEntrySchema),
});

export const hrdAttendanceListSchema = z.object({
  items: z.array(attendanceEntrySchema),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    nextCursor: z.string().optional(),
  }),
});

export const attendanceZoneSchema = z.object({
  active: z.boolean(),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  name: z.string(),
  radiusMeters: z.number(),
});

export const evidenceUploadSchema = z.object({
  expiresAt: z.string(),
  headers: z.record(z.string(), z.string()),
  method: z.literal('PUT'),
  uploadId: z.uuid(),
  url: z.url(),
});

export const evidenceAccessSchema = z.object({
  expiresAt: z.string(),
  url: z.url(),
});

export const emptySchema = z.null();

export type AttendanceEntry = z.infer<typeof attendanceEntrySchema>;
export type CreateEmployeeValues = z.infer<typeof createEmployeeSchema>;
export type EmployeeAttendanceList = z.infer<
  typeof employeeAttendanceListSchema
>;
export type Profile = z.infer<typeof profileSchema>;
