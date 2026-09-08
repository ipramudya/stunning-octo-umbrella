import { Injectable } from "@nestjs/common";
import oracledb from "oracledb";
import type { Employee, RoleName } from "./auth.js";
import { OracleDatabase } from "./oracle.js";

type EmployeeRow = {
  ID: string;
  EMPLOYEE_NUMBER: string;
  FULL_NAME: string;
  PHONE_NUMBER: string;
  EMAIL: string | null;
  PASSWORD_HASH: string;
  CREDENTIAL_VERSION: number;
  ROLES: string;
};

@Injectable()
export class EmployeeRepository {
  constructor(private readonly database: OracleDatabase) {}

  findByPhone(phoneNumber: string) {
    return this.find("e.phone_number = :value", phoneNumber);
  }

  findById(id: string) {
    return this.find("e.id = :value", id);
  }

  private async find(where: string, value: string): Promise<Employee | undefined> {
    return this.database.withConnection(async (connection) => {
      const result = await connection.execute<EmployeeRow>(
        `SELECT e.id, e.employee_number, e.full_name, e.phone_number, e.email,
                e.password_hash, e.credential_version,
                LISTAGG(r.role, ',') WITHIN GROUP (ORDER BY r.role) AS roles
          FROM employees e JOIN employee_roles r ON r.employee_id = e.id
          WHERE ${where}
          GROUP BY e.id, e.employee_number, e.full_name, e.phone_number, e.email,
                   e.password_hash, e.credential_version`,
        { value },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const row = result.rows?.[0];
      if (!row) return undefined;
      return {
        id: row.ID,
        employeeNumber: row.EMPLOYEE_NUMBER,
        fullName: row.FULL_NAME,
        phoneNumber: row.PHONE_NUMBER,
        ...(row.EMAIL ? { email: row.EMAIL } : {}),
        passwordHash: row.PASSWORD_HASH,
        credentialVersion: row.CREDENTIAL_VERSION,
        roles: row.ROLES.split(",") as RoleName[],
      };
    });
  }
}
