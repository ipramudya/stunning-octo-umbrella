import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionStore } from '../auth/session.store.js';
import type { TokenService } from '../auth/tokens.js';
import type { Environment } from '../config/config-typedef.js';
import type { EmployeeRepository } from '../employee/employee.repository.js';
import { IdentityAuthService } from './identity.service.js';

const argon = vi.hoisted(() => ({ hash: vi.fn(), verify: vi.fn() }));

vi.mock('argon2', () => ({
  argon2id: 2,
  hash: argon.hash,
  verify: argon.verify,
}));

function deferredFailure() {
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<never>((_done, fail) => {
    reject = fail;
  });

  return { promise, reject };
}

describe('IdentityAuthService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts employee lookup and dummy hashing concurrently', async () => {
    const lookup = deferredFailure();
    const employees = { findByPhone: vi.fn().mockReturnValue(lookup.promise) };
    const service = new IdentityAuthService(
      { get: vi.fn().mockReturnValue(1) } as unknown as ConfigService<
        Environment,
        true
      >,
      employees as unknown as EmployeeRepository,
      {} as unknown as SessionStore,
      {} as unknown as TokenService,
    );

    argon.hash.mockResolvedValue('dummy-hash');

    const login = service.login('+6280000000002', 'valid-password');

    await vi.waitFor(() => expect(argon.hash).toHaveBeenCalledOnce());
    expect(employees.findByPhone).toHaveBeenCalledOnce();

    const stopped = expect(login).rejects.toThrow('stop');

    lookup.reject(new Error('stop'));
    await stopped;
  });

  it('rejects a session after the employee credential version changes', async () => {
    const employees = {
      findById: vi.fn().mockResolvedValue({
        id: 'employee',
        employeeNumber: 'DEX-001',
        fullName: 'Employee',
        phoneNumber: '+6280000000002',
        passwordHash: 'unused',
        credentialVersion: 2,
        roles: ['EMPLOYEE'],
      }),
    };
    const sessions = {
      get: vi.fn().mockResolvedValue({
        employeeId: 'employee',
        credentialVersion: 1,
      }),
    };
    const tokens = {
      verify: vi.fn().mockResolvedValue({ sub: 'employee', sid: 'session' }),
    };
    const service = new IdentityAuthService(
      {} as ConfigService<Environment, true>,
      employees as unknown as EmployeeRepository,
      sessions as unknown as SessionStore,
      tokens as unknown as TokenService,
    );

    await expect(service.authorize('token', [])).rejects.toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });
  });

  it('accepts an omitted audience list', async () => {
    const employee = {
      id: 'employee',
      employeeNumber: 'DEX-001',
      fullName: 'Employee',
      phoneNumber: '+6280000000002',
      passwordHash: 'unused',
      credentialVersion: 1,
      roles: ['EMPLOYEE'],
    };
    const service = new IdentityAuthService(
      {} as ConfigService<Environment, true>,
      {
        findById: vi.fn().mockResolvedValue(employee),
      } as unknown as EmployeeRepository,
      {
        get: vi
          .fn()
          .mockResolvedValue({ employeeId: employee.id, credentialVersion: 1 }),
      } as unknown as SessionStore,
      {
        verify: vi.fn().mockResolvedValue({ sub: employee.id, sid: 'session' }),
      } as unknown as TokenService,
    );

    await expect(service.authorize('token', undefined)).resolves.toMatchObject({
      sessionId: 'session',
      tokens: [],
    });
  });
});
