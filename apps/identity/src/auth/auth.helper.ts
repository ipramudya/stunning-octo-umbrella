import { status } from '@grpc/grpc-js';
import { Role, type EmployeeProfile } from '@project/contracts';

import type { Employee } from '../employee/employee.entity.js';
import { AuthError } from './auth-error.js';

export function validateLogin(phoneNumber: string, password: string) {
  const phone = phoneNumber.trim();
  if (!/^\+62[0-9]+$/.test(phone)) {
    throw new AuthError('VALIDATION_ERROR', status.INVALID_ARGUMENT);
  }
  const length = Array.from(password).length;
  if (length < 12 || length > 128) {
    throw new AuthError('VALIDATION_ERROR', status.INVALID_ARGUMENT);
  }
  return { phoneNumber: phone, password };
}

export function profile(employee: Employee): EmployeeProfile {
  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    fullName: employee.fullName,
    phoneNumber: employee.phoneNumber,
    email: employee.email || undefined,
    roles: employee.roles.map((role) =>
      role === 'HRD' ? Role.ROLE_HRD : Role.ROLE_EMPLOYEE,
    ),
  };
}
