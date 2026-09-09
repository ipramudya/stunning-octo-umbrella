import { Role } from '@project/contracts';
import { describe, expect, it } from 'vitest';

import { profile, validateLogin } from './auth.helper.js';

describe('auth helpers', () => {
  it('trims only the phone number and counts password Unicode code points', () => {
    expect(validateLogin('  +6280000000001  ', 'password1234😀')).toEqual({
      phoneNumber: '+6280000000001',
      password: 'password1234😀',
    });
    expect(() => validateLogin('+1', 'password1234')).toThrow(
      'VALIDATION_ERROR',
    );
    expect(() => validateLogin('+6280000000001', 'short')).toThrow(
      'VALIDATION_ERROR',
    );
  });

  it('maps employees to protobuf profiles', () => {
    expect(
      profile({
        id: 'employee-1',
        employeeNumber: 'EMP-001',
        fullName: 'Employee One',
        phoneNumber: '+6280000000001',
        email: '',
        passwordHash: 'hash',
        credentialVersion: 1,
        roles: ['EMPLOYEE', 'HRD'],
      }),
    ).toEqual({
      id: 'employee-1',
      employeeNumber: 'EMP-001',
      fullName: 'Employee One',
      phoneNumber: '+6280000000001',
      email: undefined,
      roles: [Role.ROLE_EMPLOYEE, Role.ROLE_HRD],
    });
  });
});
