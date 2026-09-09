import { type EmployeeProfile, Role } from '@project/contracts';
import type { FastifyRequest } from 'fastify';

export function cookies(request: FastifyRequest) {
  return Object.fromEntries(
    (request.headers.cookie ?? '').split(';').flatMap((part) => {
      const index = part.indexOf('=');
      return index < 0
        ? []
        : [[part.slice(0, index).trim(), part.slice(index + 1)]];
    }),
  );
}

export function publicProfile(value: EmployeeProfile | undefined) {
  if (!value) {
    throw new Error('missing profile');
  }
  return {
    id: value.id,
    employeeNumber: value.employeeNumber,
    fullName: value.fullName,
    phoneNumber: value.phoneNumber,
    email: value.email || undefined,
    roles: value.roles.map((role) =>
      role === Role.ROLE_HRD ? 'HRD' : 'EMPLOYEE',
    ),
  };
}
