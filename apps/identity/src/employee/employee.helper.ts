import { status } from '@grpc/grpc-js';
import { Role, type EmployeeProfile } from '@project/contracts';
import { z } from 'zod';

import {
  IdentityError,
  type IdentityErrorCode,
} from '../identity/identity.error.js';
import type { Employee } from './employee.entity.js';

const phoneSchema = z
  .string()
  .trim()
  .max(16)
  .regex(/^\+62[0-9]+$/);
const passwordSchema = z.literal('Password123');
const emailSchema = z.email().max(254);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function fail(
  code: IdentityErrorCode,
  grpcStatus = status.INVALID_ARGUMENT,
): never {
  throw new IdentityError(code, grpcStatus);
}

function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);

  if (!result.success) {
    fail('VALIDATION_ERROR');
  }

  return result.data;
}

export function required(value: string, maximum: number) {
  return parse(
    z
      .string()
      .trim()
      .min(1)
      .refine((normalized) => Array.from(normalized).length <= maximum),
    value,
  );
}

export function password(value: string) {
  return parse(passwordSchema, value);
}

export function phone(value: string) {
  return parse(phoneSchema, value);
}

export function email(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();

  if (normalized) {
    return parse(emailSchema, normalized);
  }

  return undefined;
}

export function profile(employee: Employee): EmployeeProfile {
  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    fullName: employee.fullName,
    phoneNumber: employee.phoneNumber,
    email: employee.email || undefined,
    roles: employee.roles.map((role) => {
      if (role === 'HRD') {
        return Role.ROLE_HRD;
      }

      return Role.ROLE_EMPLOYEE;
    }),
  };
}

export function decodeCursor(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );

    if (!isRecord(parsed)) {
      fail('INVALID_CURSOR');
    }

    const { v, endpoint, employeeNumber, id } = parsed;
    const hasExpectedMetadata = v === 1 && endpoint === 'employees';
    const hasExpectedFields =
      typeof employeeNumber === 'string' && typeof id === 'string';
    const hasExpectedShape =
      Object.keys(parsed).sort().join(',') === 'employeeNumber,endpoint,id,v';

    if (!hasExpectedMetadata || !hasExpectedFields || !hasExpectedShape) {
      fail('INVALID_CURSOR');
    }

    return { employeeNumber, id };
  } catch (error) {
    if (error instanceof IdentityError) {
      throw error;
    }

    fail('INVALID_CURSOR');
  }
}

export function encodeCursor(value: Employee) {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      endpoint: 'employees',
      employeeNumber: value.employeeNumber,
      id: value.id,
    }),
  ).toString('base64url');
}
