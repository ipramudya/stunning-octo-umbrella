import { status } from '@grpc/grpc-js';

import { AuthError } from '../auth/auth-error.js';
import type { Employee } from './employee.entity.js';

const phonePattern = /^\+62[0-9]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function fail(
  code: string,
  grpcStatus = status.INVALID_ARGUMENT,
): never {
  throw new AuthError(code, grpcStatus);
}

export function required(value: string, maximum: number) {
  const normalized = value.trim();
  if (!normalized || Array.from(normalized).length > maximum) {
    fail('VALIDATION_ERROR');
  }
  return normalized;
}

export function password(value: string) {
  const length = Array.from(value).length;
  if (length < 12 || length > 128) {
    fail('VALIDATION_ERROR');
  }
  return value;
}

export function phone(value: string) {
  const normalized = value.trim();
  if (normalized.length > 16 || !phonePattern.test(normalized)) {
    fail('VALIDATION_ERROR');
  }
  return normalized;
}

export function email(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    fail('VALIDATION_ERROR');
  }
  return normalized;
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
    if (error instanceof AuthError) {
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
