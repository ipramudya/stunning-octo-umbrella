import { z } from "zod";

const text = (maximum: number) => z.string().trim().min(1).max(maximum);
const phoneNumber = z
  .string()
  .trim()
  .max(16)
  .regex(/^\+62[0-9]+$/);
const password = z.string().refine(
  (value) => {
    const length = Array.from(value).length;
    return length >= 12 && length <= 128;
  },
  {
    message: "Password must contain 12 to 128 Unicode characters",
  },
);
const email = z.union([z.literal(""), z.email().max(254)]);

export const employeeIdSchema = z.uuid();
export const employeeListSchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const createEmployeeSchema = z
  .object({
    employeeNumber: text(32),
    fullName: text(120),
    phoneNumber,
    email: email.optional(),
    password,
  })
  .strict();
export const updateEmployeeSchema = z
  .object({ fullName: text(120).optional(), email: email.nullable().optional() })
  .strict()
  .refine((value) => value.fullName !== undefined || value.email !== undefined);
export const updatePhoneSchema = z.object({ phoneNumber }).strict();
export const resetPasswordSchema = z.object({ password }).strict();

export type EmployeeListDto = z.infer<typeof employeeListSchema>;
export type CreateEmployeeDto = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeDto = z.infer<typeof updateEmployeeSchema>;
export type UpdatePhoneDto = z.infer<typeof updatePhoneSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
