import { EventEmitter } from 'node:events';

import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import type { Environment } from '../config/config-typedef.js';
import type { IdentityGrpcClient } from '../grpc-client/grpc-client.types.js';
import type { RateLimiter } from '../rate-limit/rate-limiter.js';
import { AuthController } from './auth.controller.js';

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe('AuthController', () => {
  it('runs both login rate-limit checks concurrently', async () => {
    const phone = deferred<undefined>();
    const ip = deferred<undefined>();
    const consume = vi
      .fn()
      .mockReturnValueOnce(phone.promise)
      .mockReturnValueOnce(ip.promise);
    const controller = new AuthController(
      {
        login: vi.fn().mockReturnValue(
          of({
            accessToken: 'access',
            refreshToken: 'refresh',
            profile: {
              id: 'employee',
              employeeNumber: 'DEX-001',
              fullName: 'Employee',
              phoneNumber: '+6280000000002',
              roles: [],
            },
          }),
        ),
      } as unknown as IdentityGrpcClient,
      {
        get: vi.fn().mockReturnValue('http://localhost:3000'),
      } as unknown as ConfigService<Environment, true>,
      { consume } as unknown as RateLimiter,
    );
    const request = {
      headers: { origin: 'http://localhost:3000' },
      id: 'request',
      ip: '127.0.0.1',
      raw: new EventEmitter(),
      url: '/api/v1/auth/login',
    } as unknown as FastifyRequest;
    const reply = { header: vi.fn() } as unknown as FastifyReply;

    const response = controller.login(
      { phoneNumber: '+6280000000002', password: 'valid-password' },
      request,
      reply,
    );

    await vi.waitFor(() => expect(consume).toHaveBeenCalledTimes(2));
    phone.resolve(undefined);
    ip.resolve(undefined);

    await expect(response).resolves.toMatchObject({ id: 'employee' });
  });

  it('rejects an unsafe request from a different origin', async () => {
    const config = {
      get: vi.fn().mockReturnValue('http://localhost:3000'),
    } as unknown as ConfigService<Environment, true>;
    const controller = new AuthController({} as IdentityGrpcClient, config, {
      consume: vi.fn(),
    } as unknown as RateLimiter);
    const request = {
      headers: { origin: 'https://attacker.example' },
      url: '/api/v1/auth/login',
    } as FastifyRequest;
    const reply = { header: vi.fn() } as unknown as FastifyReply;

    const response = controller.login(
      { phoneNumber: '+6280000000002', password: 'valid-password' },
      request,
      reply,
    );

    await expect(response).rejects.toBeInstanceOf(HttpException);
    await expect(response).rejects.toSatisfy(
      (error: HttpException) => error.getStatus() === 403,
    );
  });
});
