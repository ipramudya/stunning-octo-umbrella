import { describe, expect, it } from 'vitest';

import { validateLogin } from './auth.helper.js';

describe('auth helpers', () => {
  it('trims the phone number and accepts the recruitment password', () => {
    expect(validateLogin('  +6280000000001  ', 'valid-password')).toEqual({
      phoneNumber: '+6280000000001',
      password: 'valid-password',
    });
    expect(() => validateLogin('+1', 'valid-password')).toThrow(
      'VALIDATION_ERROR',
    );
    expect(() => validateLogin('+6280000000001', 'short')).toThrow(
      'VALIDATION_ERROR',
    );
  });
});
