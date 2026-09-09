import { randomUUID } from 'node:crypto';

import { Metadata } from '@grpc/grpc-js';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TokenAudience } from '@project/contracts';
import { firstValueFrom, fromEvent, takeUntil } from 'rxjs';

import { cookies } from '../auth/auth.helper.js';
import type { Environment } from '../config/config-typedef.js';
import { IDENTITY_CLIENT } from '../grpc-client/grpc-client.providers.js';
import type { IdentityGrpcClient } from '../grpc-client/grpc-client.types.js';
import { fail } from '../problem/problem.js';
import { RateLimiter, RateLimitError } from '../rate-limit/rate-limiter.js';
import type { GatewayCall, GatewayCallContext } from './gateway-call.types.js';

@Injectable()
export class GatewayCallService {
  constructor(
    @Inject(IDENTITY_CLIENT) private readonly identity: IdentityGrpcClient,
    private readonly config: ConfigService<Environment, true>,
    private readonly rateLimiter: RateLimiter,
  ) {}

  async run<T>(call: GatewayCall<T>) {
    const {
      request,
      reply,
      audiences,
      rateLimited = false,
      unsafe = false,
      idempotent = false,
    } = call;
    const traceId = request.id || randomUUID();

    reply.header('x-correlation-id', traceId);

    if (
      unsafe &&
      request.headers.origin !== this.config.get('APP_ORIGIN', { infer: true })
    ) {
      fail(403, 'FORBIDDEN', 'Request origin is not allowed', request, traceId);
    }

    const idempotencyHeader = request.headers['idempotency-key'];
    let idempotencyKey: string | undefined;
    if (typeof idempotencyHeader === 'string') {
      idempotencyKey = idempotencyHeader;
    }

    if (idempotent && (!idempotencyKey || idempotencyKey.length > 128)) {
      fail(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'A valid Idempotency-Key header is required',
        request,
        traceId,
      );
    }

    const access = new Metadata();

    access.set('authorization', `Bearer ${cookies(request).dexa_access ?? ''}`);
    access.set('x-correlation-id', traceId);

    const cancelled = fromEvent(request.raw, 'aborted');

    try {
      const authorization = await firstValueFrom(
        this.identity
          .authorizeAccess({ audiences: [...audiences] }, access, {
            deadline: Date.now() + 3_000,
          })
          .pipe(takeUntil(cancelled)),
      );

      if (rateLimited) {
        await this.rateLimiter.consume({
          scope: 'authenticated',
          subject: authorization.sessionId,
          maximum: 120,
          windowSeconds: 60,
        });
      }

      const tokens = new Map(
        authorization.tokens.map(({ audience, token }) => [audience, token]),
      );
      const options = { deadline: Date.now() + 3_000 };
      const context: GatewayCallContext = {
        metadata: (audience: TokenAudience) => {
          const token = tokens.get(audience);

          if (!token || !audiences.includes(audience)) {
            throw new Error('missing delegated token');
          }

          const metadata = new Metadata();

          metadata.set('authorization', `Bearer ${token}`);
          metadata.set('x-correlation-id', traceId);

          if (idempotent && idempotencyKey) {
            metadata.set('idempotency-key', idempotencyKey);
          }

          return metadata;
        },
        options,
        cancelled,
        traceId,
      };

      return await call.operation(context);
    } catch (error) {
      if (error instanceof RateLimitError) {
        reply.header('retry-after', error.retryAfter);
        fail(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests', request, traceId);
      }

      if (call.failure) {
        call.failure(error, traceId);
      }

      throw error;
    }
  }
}
