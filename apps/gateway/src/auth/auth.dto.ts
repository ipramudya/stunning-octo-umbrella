import { z } from 'zod';

export const loginSchema = z
  .object({
    phoneNumber: z.string(),
    password: z.string().refine((value) => {
      const length = Array.from(value).length;

      return length >= 12 && length <= 128;
    }),
  })
  .strict();

export type LoginDto = z.infer<typeof loginSchema>;
