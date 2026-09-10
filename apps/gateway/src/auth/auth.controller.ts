import { randomUUID } from 'node:crypto';

import { Metadata } from '@grpc/grpc-js';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SessionCredentials } from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { firstValueFrom, fromEvent, takeUntil } from 'rxjs';

import type { Environment } from '../config/config-typedef.js';
import { publicProfile } from '../employee/employee.dto.js';
import { IDENTITY_CLIENT } from '../grpc-client/grpc-client.providers.js';
import type { IdentityGrpcClient } from '../grpc-client/grpc-client.types.js';
import { fail } from '../problem/problem.js';
import {
  RateLimiter,
  RateLimitError,
  rateKey,
} from '../rate-limit/rate-limiter.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import { loginSchema, type LoginDto } from './auth.dto.js';
import { cookies } from './auth.helper.js';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(IDENTITY_CLIENT) private readonly identity: IdentityGrpcClient,
    private readonly config: ConfigService<Environment, true>,
    private readonly rateLimiter: RateLimiter,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const context = this.context(request, reply, true);

    await this.limit({
      checks: [
        {
          scope: 'login:phone',
          subject: rateKey(body.phoneNumber.trim()),
          maximum: 5,
          windowSeconds: 900,
        },
        {
          scope: 'login:ip',
          subject: rateKey(request.ip),
          maximum: 20,
          windowSeconds: 900,
        },
      ],
      request,
      reply,
      traceId: context.traceId,
    });

    const result = await firstValueFrom(
      this.identity
        .login(body, context.metadata, context.options)
        .pipe(takeUntil(context.cancelled)),
    );

    this.setCredentials(reply, result);

    return publicProfile(result.profile);
  }

  @Post('refresh')
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const context = this.context(request, reply, true);
    const refreshToken = cookies(request).dexa_refresh ?? '';

    await this.limit({
      checks: [
        {
          scope: 'refresh:token',
          subject: rateKey(refreshToken),
          maximum: 10,
          windowSeconds: 60,
        },
        {
          scope: 'refresh:ip',
          subject: rateKey(request.ip),
          maximum: 30,
          windowSeconds: 60,
        },
      ],
      request,
      reply,
      traceId: context.traceId,
    });

    const result = await firstValueFrom(
      this.identity
        .refreshSession({ refreshToken }, context.metadata, context.options)
        .pipe(takeUntil(context.cancelled)),
    );

    this.setCredentials(reply, result);
    reply.status(204);
  }

  @Post('logout')
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const context = this.context(request, reply, true);

    try {
      await firstValueFrom(
        this.identity
          .logoutSession(
            { refreshToken: cookies(request).dexa_refresh ?? '' },
            context.metadata,
            context.options,
          )
          .pipe(takeUntil(context.cancelled)),
      );
    } catch {
      this.logger.warn(
        `Session revocation could not be confirmed traceId=${context.traceId}`,
      );
    }

    reply.header('set-cookie', [
      this.cookie({ name: 'dexa_access', value: '', path: '/', maxAge: 0 }),
      this.cookie({
        name: 'dexa_refresh',
        value: '',
        path: '/api/v1/auth',
        maxAge: 0,
      }),
    ]);
    reply.status(204);
  }

  @Get('me')
  async me(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const context = this.context(request, reply, false);

    context.metadata.set(
      'authorization',
      `Bearer ${cookies(request).dexa_access ?? ''}`,
    );

    const result = await firstValueFrom(
      this.identity
        .authorizeAccess({ audiences: [] }, context.metadata, context.options)
        .pipe(takeUntil(context.cancelled)),
    );

    await this.limit({
      checks: [
        {
          scope: 'authenticated',
          subject: result.sessionId,
          maximum: 120,
          windowSeconds: 60,
        },
      ],
      request,
      reply,
      traceId: context.traceId,
    });

    return publicProfile(result.profile);
  }

  private context(
    request: FastifyRequest,
    reply: FastifyReply,
    unsafe: boolean,
  ) {
    const traceId = randomUUID();

    reply.header('x-correlation-id', traceId);

    if (
      unsafe &&
      request.headers.origin !== this.config.get('APP_ORIGIN', { infer: true })
    ) {
      fail(403, 'FORBIDDEN', 'Request origin is not allowed', request, traceId);
    }

    const metadata = new Metadata();

    metadata.set('x-correlation-id', traceId);

    return {
      metadata,
      traceId,
      options: { deadline: Date.now() + 3_000 },
      cancelled: fromEvent(request.raw, 'aborted'),
    };
  }

  private async limit({
    checks,
    request,
    reply,
    traceId,
  }: {
    checks: Parameters<RateLimiter['consume']>[0][];
    request: FastifyRequest;
    reply: FastifyReply;
    traceId: string;
  }) {
    const results = await Promise.allSettled(
      checks.map((check) => this.rateLimiter.consume(check)),
    );

    const failure = results.find((result) => result.status === 'rejected');

    if (!failure) {
      return;
    }

    const error: unknown = failure.reason;

    if (error instanceof RateLimitError) {
      reply.header('retry-after', error.retryAfter);
      fail(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests', request, traceId);
    }

    fail(
      503,
      'DEPENDENCY_UNAVAILABLE',
      'The service is temporarily unavailable',
      request,
      traceId,
    );
  }

  private setCredentials(reply: FastifyReply, credentials: SessionCredentials) {
    reply.header('set-cookie', [
      this.cookie({
        name: 'dexa_access',
        value: credentials.accessToken,
        path: '/',
        maxAge: 900,
      }),
      this.cookie({
        name: 'dexa_refresh',
        value: credentials.refreshToken,
        path: '/api/v1/auth',
        maxAge: 604_800,
      }),
    ]);
  }

  private cookie({
    name,
    value,
    path,
    maxAge,
  }: {
    name: string;
    value: string;
    path: string;
    maxAge: number;
  }) {
    const localhost = ['localhost', '127.0.0.1'].includes(
      new URL(this.config.get('APP_ORIGIN', { infer: true })).hostname,
    );
    let secure = '; Secure';
    if (localhost) {
      secure = '';
    }

    return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure}`;
  }
}
