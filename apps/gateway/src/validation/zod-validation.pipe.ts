import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (result.success) {
      return result.data;
    }

    throw new BadRequestException({
      type: 'about:blank',
      title: 'Permintaan tidak valid',
      status: 400,
      detail: 'Data yang dikirim tidak valid',
      code: 'VALIDATION_ERROR',
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: 'Nilai tidak valid',
      })),
    });
  }
}
