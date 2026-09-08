import { status } from "@grpc/grpc-js";

export const roles = ["EMPLOYEE", "HRD"] as const;
export type RoleName = (typeof roles)[number];

export interface Employee {
  id: string;
  employeeNumber: string;
  fullName: string;
  phoneNumber: string;
  email?: string;
  passwordHash: string;
  credentialVersion: number;
  roles: RoleName[];
}

export interface Session {
  employeeId: string;
  credentialVersion: number;
  createdAt: number;
  expiresAt: number;
  refreshDigest: string;
}

export class AuthError extends Error {
  constructor(
    readonly code: string,
    readonly grpcStatus: status,
  ) {
    super(code);
  }
}

export function validateLogin(phoneNumber: string, password: string) {
  const phone = phoneNumber.trim();
  if (!/^\+62[0-9]+$/.test(phone)) {
    throw new AuthError("VALIDATION_ERROR", status.INVALID_ARGUMENT);
  }
  const length = Array.from(password).length;
  if (length < 12 || length > 128) {
    throw new AuthError("VALIDATION_ERROR", status.INVALID_ARGUMENT);
  }
  return { phoneNumber: phone, password };
}
