import { Injectable } from "@nestjs/common";
import oracledb, { type Connection } from "oracledb";
import type { Employee, RoleName } from "./auth.js";
import { OracleDatabase } from "./oracle.js";

export type EmployeeInput = {
  employeeNumber: string;
  fullName: string;
  phoneNumber: string;
  email?: string;
  passwordHash: string;
};

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

const employeeColumns = `e.id, e.employee_number, e.full_name, e.phone_number, e.email,
  e.password_hash, e.credential_version,
  (SELECT LISTAGG(r.role, ',') WITHIN GROUP (ORDER BY r.role)
     FROM employee_roles r WHERE r.employee_id = e.id) AS roles`;

function employee(row: EmployeeRow): Employee {
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
}

@Injectable()
export class EmployeeRepository {
  constructor(private readonly database: OracleDatabase) {}

  findByPhone(phoneNumber: string) {
    return this.find("e.phone_number = :value", phoneNumber);
  }

  findById(id: string) {
    return this.find("e.id = :value", id);
  }

  async list(
    query: string | undefined,
    after: { employeeNumber: string; id: string } | undefined,
    limit: number,
  ) {
    return this.database.withConnection(async (connection) => {
      const escaped = query?.replace(/[\\%_]/g, "\\$&");
      const result = await connection.execute<EmployeeRow>(
        `SELECT ${employeeColumns}
           FROM employees e
          WHERE (:query IS NULL OR e.employee_number LIKE :prefix ESCAPE '\\'
                 OR e.phone_number LIKE :prefix ESCAPE '\\'
                 OR UPPER(e.full_name) LIKE :contains ESCAPE '\\')
            AND (:after_number IS NULL OR e.employee_number > :after_number
                 OR (e.employee_number = :after_number AND e.id > :after_id))
          ORDER BY e.employee_number, e.id
          FETCH FIRST ${limit + 1} ROWS ONLY`,
        {
          query: escaped ?? null,
          prefix: escaped ? `${escaped.toUpperCase()}%` : null,
          contains: escaped ? `%${escaped.toUpperCase()}%` : null,
          after_number: after?.employeeNumber ?? null,
          after_id: after?.id ?? null,
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      return (result.rows ?? []).map(employee);
    });
  }

  async create(id: string, input: EmployeeInput, actorId: string) {
    await this.transaction(async (connection) => {
      await connection.execute(
        `INSERT INTO employees
          (id, employee_number, full_name, phone_number, email, password_hash, created_by, updated_by)
         VALUES (:id, :employee_number, :full_name, :phone_number, :email, :password_hash, :actor, :actor)`,
        {
          id,
          employee_number: input.employeeNumber,
          full_name: input.fullName,
          phone_number: input.phoneNumber,
          email: input.email ?? null,
          password_hash: input.passwordHash,
          actor: actorId,
        },
      );
      await connection.execute(
        `INSERT INTO employee_roles (employee_id, role) VALUES (:id, 'EMPLOYEE')`,
        { id },
      );
    });
  }

  async updateProfile(
    id: string,
    fullName: string | undefined,
    email: string | null | undefined,
    actorId: string,
  ) {
    return this.transaction(async (connection) => {
      const result = await connection.execute(
        `UPDATE employees SET
           full_name = COALESCE(:full_name, full_name),
           email = CASE WHEN :change_email = 1 THEN :email ELSE email END,
           updated_at = SYSTIMESTAMP, updated_by = :actor
         WHERE id = :id`,
        {
          full_name: fullName ?? null,
          change_email: email === undefined ? 0 : 1,
          email: email ?? null,
          actor: actorId,
          id,
        },
      );
      return result.rowsAffected === 1;
    });
  }

  async updatePhone(id: string, phoneNumber: string, actorId: string) {
    return this.updateCredential(
      `phone_number = :value, credential_version = credential_version + 1`,
      id,
      phoneNumber,
      actorId,
    );
  }

  async updatePassword(id: string, passwordHash: string, actorId: string) {
    return this.updateCredential(
      `password_hash = :value, credential_version = credential_version + 1`,
      id,
      passwordHash,
      actorId,
    );
  }

  async conflict(
    input: { employeeNumber?: string; phoneNumber?: string; email?: string },
    excludeId?: string,
  ) {
    return this.database.withConnection(async (connection) => {
      const result = await connection.execute<{
        EMPLOYEE_NUMBER: string;
        PHONE_NUMBER: string;
        EMAIL: string | null;
      }>(
        `SELECT employee_number, phone_number, email FROM employees
          WHERE (:exclude_id IS NULL OR id <> :exclude_id)
            AND ((:employee_number IS NOT NULL AND employee_number = :employee_number)
              OR (:phone_number IS NOT NULL AND phone_number = :phone_number)
              OR (:email IS NOT NULL AND email = :email))
          FETCH FIRST 1 ROW ONLY`,
        {
          exclude_id: excludeId ?? null,
          employee_number: input.employeeNumber ?? null,
          phone_number: input.phoneNumber ?? null,
          email: input.email ?? null,
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const row = result.rows?.[0];
      if (!row) return undefined;
      if (input.employeeNumber === row.EMPLOYEE_NUMBER) return "EMPLOYEE_NUMBER_ALREADY_EXISTS";
      if (input.phoneNumber === row.PHONE_NUMBER) return "PHONE_NUMBER_ALREADY_EXISTS";
      return "EMAIL_ALREADY_EXISTS";
    });
  }

  private async updateCredential(sql: string, id: string, value: string, actorId: string) {
    return this.transaction(async (connection) => {
      const result = await connection.execute(
        `UPDATE employees SET ${sql}, updated_at = SYSTIMESTAMP, updated_by = :actor WHERE id = :id`,
        { value, actor: actorId, id },
      );
      return result.rowsAffected === 1;
    });
  }

  private async find(where: string, value: string): Promise<Employee | undefined> {
    return this.database.withConnection(async (connection) => {
      const result = await connection.execute<EmployeeRow>(
        `SELECT ${employeeColumns} FROM employees e WHERE ${where}`,
        { value },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const row = result.rows?.[0];
      return row ? employee(row) : undefined;
    });
  }

  private async transaction<T>(work: (connection: Connection) => Promise<T>) {
    return this.database.withConnection(async (connection) => {
      try {
        const value = await work(connection);
        await connection.commit();
        return value;
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
  }
}
