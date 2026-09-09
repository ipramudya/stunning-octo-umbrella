import { EventEmitter } from 'node:events';

import type { ClientGrpc } from '@nestjs/microservices';
import { type Authorization, TokenAudience } from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import type { Environment } from '../config/config-typedef.js';
import type { IdentityGrpcClient } from '../grpc-client/grpc-client.types.js';
import type { RateLimiter } from '../rate-limit/rate-limiter.js';
import { GatewayCallService } from './gateway-call.service.js';

function setup() {
  const authorizeAccess = vi.fn(() =>
    of<Authorization>({
      profile: undefined,
      sessionId: 'session-1',
      tokens: [
        {
          audience: TokenAudience.TOKEN_AUDIENCE_ATTENDANCE,
          token: 'attendance-token',
        },
      ],
    }),
  );
  const identity = {
    authorizeAccess,
  } as Pick<IdentityGrpcClient, 'authorizeAccess'>;
  const grpc = {
    getService: () => identity,
  } as unknown as ClientGrpc;
  const config = {
    get: (key: keyof Environment) =>
      key === 'APP_ORIGIN' ? 'https://app.example' : undefined,
  } as ConstructorParameters<typeof GatewayCallService>[1];
  const consume = vi.fn();
  const rateLimiter = {
    consume,
  } as Pick<RateLimiter, 'consume'> as RateLimiter;
  const service = new GatewayCallService(grpc, config, rateLimiter);
  service.onModuleInit();

  const headers = new Map<string, unknown>();
  const reply = {
    header: vi.fn((name: string, value: unknown) => {
      headers.set(name, value);
      return reply;
    }),
  } as unknown as FastifyReply;
  const request = {
    headers: {
      cookie: 'dexa_access=access-token',
      origin: 'https://app.example',
      'idempotency-key': 'request-1',
    },
    raw: new EventEmitter(),
    url: '/attendance',
  } as unknown as FastifyRequest;

  return {
    service,
    authorizeAccess,
    consume,
    request,
    reply,
    headers,
  };
}

describe('GatewayCallService', () => {
  it('authorizes once and builds delegated metadata', async () => {
    const { service, authorizeAccess, consume, request, reply, headers } =
      setup();

    const result = await service.run({
      request,
      reply,
      audiences: [TokenAudience.TOKEN_AUDIENCE_ATTENDANCE],
      rateLimited: true,
      unsafe: true,
      idempotent: true,
      operation: async (context) =>
        context.metadata(TokenAudience.TOKEN_AUDIENCE_ATTENDANCE).getMap(),
    });

    expect(result).toMatchObject({
      authorization: 'Bearer attendance-token',
      'idempotency-key': 'request-1',
    });
    expect(result['x-correlation-id']).toBe(headers.get('x-correlation-id'));
    expect(authorizeAccess).toHaveBeenCalledOnce();
    expect(consume).toHaveBeenCalledOnce();
  });

  it('rejects an unsafe request before authorization when its origin differs', async () => {
    const { service, authorizeAccess, request, reply } = setup();
    request.headers.origin = 'https://attacker.example';

    await expect(
      service.run({
        request,
        reply,
        audiences: [TokenAudience.TOKEN_AUDIENCE_ATTENDANCE],
        unsafe: true,
        operation: async () => undefined,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(authorizeAccess).not.toHaveBeenCalled();
  });
});
