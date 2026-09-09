import { status } from '@grpc/grpc-js';

export type AuthErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'EMAIL_ALREADY_EXISTS'
  | 'EMPLOYEE_DATA_INTEGRITY_ERROR'
  | 'EMPLOYEE_NOT_FOUND'
  | 'EMPLOYEE_NUMBER_ALREADY_EXISTS'
  | 'FORBIDDEN'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_CURSOR'
  | 'PHONE_NUMBER_ALREADY_EXISTS'
  | 'VALIDATION_ERROR';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    readonly grpcStatus: status,
  ) {
    super(code);
  }
}
