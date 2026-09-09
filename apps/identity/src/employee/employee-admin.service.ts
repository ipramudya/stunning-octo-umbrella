import { randomUUID } from 'node:crypto';

import { status } from '@grpc/grpc-js';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { argon2id, hash } from 'argon2';

import { AuthError } from '../auth/auth-error.js';
import { profile } from '../auth/auth.helper.js';
import { SessionStore } from '../auth/session.store.js';
import { TokenService } from '../auth/tokens.js';
import type { Environment } from '../config/config-typedef.js';
import type { EmployeeInput } from './employee.entity.js';
import {
  decodeCursor,
  email,
  encodeCursor,
  fail,
  password,
  phone,
  required,
} from './employee.helper.js';
import { EmployeeRepository } from './employee.repository.js';

type Actor = { id: string };

@Injectable()
export class EmployeeAdminService {
  // Dependency injection determines this constructor signature.
  // oxlint-disable-next-line max-params
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
    @Inject(EmployeeRepository) private readonly employees: EmployeeRepository,
    @Inject(SessionStore) private readonly sessions: SessionStore,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  async authorize(token: string): Promise<Actor> {
    try {
      const claims = await this.tokens.verify(token, 'dexa-identity');

      if (!claims.roles.includes('HRD')) {
        fail('FORBIDDEN', status.PERMISSION_DENIED);
      }

      return { id: claims.sub };
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }

      fail('AUTHENTICATION_REQUIRED', status.UNAUTHENTICATED);
    }
  }

  async list({
    token,
    query,
    cursor,
    requestedLimit,
  }: {
    token: string;
    query: string | undefined;
    cursor: string | undefined;
    requestedLimit: number;
  }) {
    await this.authorize(token);

    const limit = requestedLimit || 20;

    if (limit < 1 || limit > 100) {
      fail('VALIDATION_ERROR');
    }

    const q = query?.trim();

    if (q && Array.from(q).length > 120) {
      fail('VALIDATION_ERROR');
    }

    const rows = await this.employees.list(
      q || undefined,
      decodeCursor(cursor),
      limit,
    );

    const hasNextPage = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    let nextCursor;
    if (hasNextPage && last) {
      nextCursor = encodeCursor(last);
    }

    return {
      items: items.map(profile),
      nextCursor,
      hasNextPage,
    };
  }

  async get(token: string, employeeId: string) {
    await this.authorize(token);

    return profile(await this.existing(employeeId));
  }

  async batchGet(token: string, employeeIds: string[]) {
    await this.authorize(token);

    const ids = [...new Set(employeeIds)];

    if (ids.length < 1 || ids.length > 100 || ids.some((id) => !id)) {
      fail('VALIDATION_ERROR');
    }

    const employees = await this.employees.findByIds(ids);

    if (employees.length !== ids.length) {
      fail('EMPLOYEE_DATA_INTEGRITY_ERROR', status.UNAVAILABLE);
    }

    const byId = new Map(employees.map((employee) => [employee.id, employee]));

    return ids.map((id) => {
      const employee = byId.get(id);

      if (!employee) {
        fail('EMPLOYEE_DATA_INTEGRITY_ERROR', status.UNAVAILABLE);
      }

      return profile(employee);
    });
  }

  async create(
    token: string,
    raw: Omit<EmployeeInput, 'passwordHash'> & { password: string },
  ) {
    const actor = await this.authorize(token);

    const input = {
      employeeNumber: required(raw.employeeNumber, 32).toUpperCase(),
      fullName: required(raw.fullName, 120),
      phoneNumber: phone(raw.phoneNumber),
      email: email(raw.email) || undefined,
      password: password(raw.password),
    };
    const id = randomUUID();

    try {
      await this.employees.create(
        id,
        { ...input, passwordHash: await this.passwordHash(input.password) },
        actor.id,
      );
    } catch (error) {
      await this.mapUnique(error, input);
    }

    return profile(await this.existing(id));
  }

  async updateProfile(
    token: string,
    employeeId: string,
    changes: { fullName?: string; email?: string | null },
  ) {
    const actor = await this.authorize(token);

    if (changes.fullName === undefined && changes.email === undefined) {
      fail('VALIDATION_ERROR');
    }

    let fullName;
    if (changes.fullName !== undefined) {
      fullName = required(changes.fullName, 120);
    }

    let normalizedEmail;
    if (changes.email === null) {
      normalizedEmail = null;
    } else {
      normalizedEmail = email(changes.email);
    }

    try {
      if (
        !(await this.employees.updateProfile({
          id: employeeId,
          fullName,
          email: normalizedEmail,
          actorId: actor.id,
        }))
      ) {
        fail('EMPLOYEE_NOT_FOUND', status.NOT_FOUND);
      }
    } catch (error) {
      const uniqueInput: { email?: string } = {};

      if (normalizedEmail) {
        uniqueInput.email = normalizedEmail;
      }

      await this.mapUnique(error, uniqueInput, employeeId);
    }

    return profile(await this.existing(employeeId));
  }

  async updatePhone(token: string, employeeId: string, rawPhone: string) {
    const actor = await this.authorize(token);

    const phoneNumber = phone(rawPhone);

    try {
      if (
        !(await this.employees.updatePhone(employeeId, phoneNumber, actor.id))
      ) {
        fail('EMPLOYEE_NOT_FOUND', status.NOT_FOUND);
      }
    } catch (error) {
      await this.mapUnique(error, { phoneNumber }, employeeId);
    }

    await this.cleanup(employeeId);

    return profile(await this.existing(employeeId));
  }

  async resetPassword(token: string, employeeId: string, rawPassword: string) {
    const actor = await this.authorize(token);

    const passwordHash = await this.passwordHash(password(rawPassword));

    if (
      !(await this.employees.updatePassword(employeeId, passwordHash, actor.id))
    ) {
      fail('EMPLOYEE_NOT_FOUND', status.NOT_FOUND);
    }

    await this.cleanup(employeeId);
  }

  private async existing(id: string) {
    const value = await this.employees.findById(id);

    if (!value) {
      fail('EMPLOYEE_NOT_FOUND', status.NOT_FOUND);
    }

    return value;
  }

  private passwordHash(value: string) {
    return hash(value, {
      type: argon2id,
      memoryCost: this.config.get('ARGON2_MEMORY_COST', { infer: true }),
      timeCost: this.config.get('ARGON2_TIME_COST', { infer: true }),
      parallelism: this.config.get('ARGON2_PARALLELISM', { infer: true }),
    });
  }

  private async cleanup(employeeId: string) {
    try {
      await this.sessions.revokeEmployee(employeeId);
    } catch {
      // The committed credential version remains authoritative when Redis is unavailable.
    }
  }

  private async mapUnique(
    error: unknown,
    input: { employeeNumber?: string; phoneNumber?: string; email?: string },
    excludeId?: string,
  ): Promise<never> {
    if (!String(error).includes('ORA-00001')) {
      throw error;
    }

    const conflict = await this.employees.conflict(input, excludeId);

    let grpcStatus = status.INVALID_ARGUMENT;
    if (conflict) {
      grpcStatus = status.ALREADY_EXISTS;
    }

    fail(conflict ?? 'VALIDATION_ERROR', grpcStatus);
  }
}
