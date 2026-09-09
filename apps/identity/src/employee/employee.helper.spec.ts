import { status } from '@grpc/grpc-js';
import { describe, expect, it } from 'vitest';

import { AuthError } from '../auth/auth-error.js';
import {
  decodeCursor,
  email,
  encodeCursor,
  fail,
  password,
  phone,
  required,
} from './employee.helper.js';

describe('employee helpers', () => {
  it('throws typed auth errors', () => {
    expect(() => fail('NOT_FOUND', status.NOT_FOUND)).toThrow(
      new AuthError('NOT_FOUND', status.NOT_FOUND),
    );
  });

  it('normalizes and validates employee fields', () => {
    expect(required('  Employee One  ', 20)).toBe('Employee One');
    expect(phone('  +6280000000001  ')).toBe('+6280000000001');
    expect(email('  EMPLOYEE@EXAMPLE.COM  ')).toBe('employee@example.com');
    expect(email('  ')).toBeUndefined();
    expect(password('password1234')).toBe('password1234');

    expect(() => required(' ', 20)).toThrow('VALIDATION_ERROR');
    expect(() => phone('+1')).toThrow('VALIDATION_ERROR');
    expect(() => email('invalid')).toThrow('VALIDATION_ERROR');
    expect(() => password('short')).toThrow('VALIDATION_ERROR');
  });

  it('round-trips employee cursors and rejects malformed values', () => {
    const employee = {
      id: 'employee-1',
      employeeNumber: 'EMP-001',
      fullName: 'Employee One',
      phoneNumber: '+6280000000001',
      passwordHash: 'hash',
      credentialVersion: 1,
      roles: ['EMPLOYEE' as const],
    };

    expect(decodeCursor(encodeCursor(employee))).toEqual({
      employeeNumber: 'EMP-001',
      id: 'employee-1',
    });
    expect(decodeCursor(undefined)).toBeUndefined();
    expect(() => decodeCursor('invalid')).toThrow('INVALID_CURSOR');
    expect(() =>
      decodeCursor(
        Buffer.from(JSON.stringify({ v: 1, endpoint: 'employees' })).toString(
          'base64url',
        ),
      ),
    ).toThrow('INVALID_CURSOR');
  });
});
