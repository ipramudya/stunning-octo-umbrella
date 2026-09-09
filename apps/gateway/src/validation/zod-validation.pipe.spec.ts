import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { loginSchema } from '../auth/auth.dto.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(loginSchema);

  it('rejects unexpected login fields', () => {
    expect(() =>
      pipe.transform({
        phoneNumber: '+6280000000002',
        password: 'valid-password',
        unexpected: true,
      }),
    ).toThrow(BadRequestException);
  });
});
