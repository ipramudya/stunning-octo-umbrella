import { Role } from '@project/contracts';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';

import { cookies, publicProfile } from './auth.helper.js';

describe('auth helpers', () => {
  it('parses cookies without truncating values containing equals signs', () => {
    const request = {
      headers: { cookie: 'dexa_access=access; token=abc==; malformed' },
    } as FastifyRequest;

    expect(cookies(request)).toEqual({
      dexa_access: 'access',
      token: 'abc==',
    });
    expect(cookies({ headers: {} } as FastifyRequest)).toEqual({});
  });

  it('maps the public employee profile', () => {
    expect(
      publicProfile({
        id: 'employee-1',
        employeeNumber: 'EMP-001',
        fullName: 'Employee One',
        phoneNumber: '+6280000000001',
        roles: [Role.ROLE_EMPLOYEE, Role.ROLE_HRD],
      }),
    ).toEqual({
      id: 'employee-1',
      employeeNumber: 'EMP-001',
      fullName: 'Employee One',
      phoneNumber: '+6280000000001',
      email: undefined,
      roles: ['EMPLOYEE', 'HRD'],
    });
    expect(() => publicProfile(undefined)).toThrow('missing profile');
  });
});
