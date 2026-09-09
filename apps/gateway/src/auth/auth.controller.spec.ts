import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { Environment } from '../config/config-typedef.js';
import type { IdentityGrpcClient } from '../grpc-client/grpc-client.types.js';
import type { RateLimiter } from '../rate-limit/rate-limiter.js';
import { AuthController } from './auth.controller.js';

describe('AuthController', () => {
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
