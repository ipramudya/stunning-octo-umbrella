export const roles = ['EMPLOYEE', 'HRD'] as const;
export type RoleName = (typeof roles)[number];

export type Employee = {
  id: string;
  employeeNumber: string;
  fullName: string;
  phoneNumber: string;
  email?: string;
  passwordHash: string;
  credentialVersion: number;
  roles: RoleName[];
};

export type EmployeeInput = {
  employeeNumber: string;
  fullName: string;
  phoneNumber: string;
  email?: string;
  passwordHash: string;
};

export type EmployeeRow = {
  ID: string;
  EMPLOYEE_NUMBER: string;
  FULL_NAME: string;
  PHONE_NUMBER: string;
  EMAIL: string | null;
  PASSWORD_HASH: string;
  CREDENTIAL_VERSION: number;
  ROLES: string;
};
