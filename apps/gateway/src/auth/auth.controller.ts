import { randomUUID } from 'node:crypto';

import { status, Metadata } from '@grpc/grpc-js';
import type { OnModuleInit } from '@nestjs/common';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ClientGrpc } from '@nestjs/microservices';
import type { SessionCredentials } from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { firstValueFrom, fromEvent, takeUntil } from 'rxjs';

import type { Environment } from '../config/config-typedef.js';
import type { IdentityGrpcClient } from '../grpc-client/grpc-client.types.js';
import { grpcCode } from '../grpc-client/grpc-error.js';
import { IDENTITY_HEALTH_CLIENT } from '../health/grpc-health.client.js';
import { fail } from '../problem/problem.js';
import {
  RateLimiter,
  RateLimitError,
  rateKey,
} from '../rate-limit/rate-limiter.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import { loginSchema, type LoginDto } from './auth.dto.js';
import { cookies, publicProfile } from './auth.helper.js';

@Controller({ path: 'auth', version: '1' })
export class AuthController implements OnModuleInit {
  private readonly logger = new Logger(AuthController.name);
  private identity!: IdentityGrpcClient;

  constructor(
    @Inject(IDENTITY_HEALTH_CLIENT) private readonly grpc: ClientGrpc,
    private readonly config: ConfigService<Environment, true>,
    private readonly rateLimiter: RateLimiter,
  ) {}

  onModuleInit() {
    this.identity = this.grpc.getService<IdentityGrpcClient>('IdentityService');
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const context = this.context(request, reply, true);
    await this.limit({
      scope: 'login:phone',
      subject: rateKey(body.phoneNumber.trim()),
      maximum: 5,
      windowSeconds: 900,
      request,
      reply,
      traceId: context.traceId,
    });
    await this.limit({
      scope: 'login:ip',
      subject: rateKey(request.ip),
      maximum: 20,
      windowSeconds: 900,
      request,
      reply,
      traceId: context.traceId,
    });
    try {
      const result = await firstValueFrom(
        this.identity
          .login(body, context.metadata, context.options)
          .pipe(takeUntil(context.cancelled)),
      );
      this.setCredentials(reply, result);
      return publicProfile(result.profile);
    } catch (error) {
      this.grpcFailure({
        error,
        operation: 'login',
        request,
        traceId: context.traceId,
      });
    }
  }

  @Post('refresh')
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const context = this.context(request, reply, true);
    const refreshToken = cookies(request).dexa_refresh ?? '';
    await this.limit({
      scope: 'refresh:token',
      subject: rateKey(refreshToken),
      maximum: 10,
      windowSeconds: 60,
      request,
      reply,
      traceId: context.traceId,
    });
    await this.limit({
      scope: 'refresh:ip',
      subject: rateKey(request.ip),
      maximum: 30,
      windowSeconds: 60,
      request,
      reply,
      traceId: context.traceId,
    });
    try {
      const result = await firstValueFrom(
        this.identity
          .refreshSession({ refreshToken }, context.metadata, context.options)
          .pipe(takeUntil(context.cancelled)),
      );
      this.setCredentials(reply, result);
      reply.status(204);
    } catch (error) {
      this.grpcFailure({
        error,
        operation: 'refresh',
        request,
        traceId: context.traceId,
      });
    }
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
      this.cookie({ name: 'dexa_access', value: '', path: '/api', maxAge: 0 }),
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
    try {
      const result = await firstValueFrom(
        this.identity
          .authorizeAccess({ audiences: [] }, context.metadata, context.options)
          .pipe(takeUntil(context.cancelled)),
      );
      await this.limit({
        scope: 'authenticated',
        subject: result.sessionId,
        maximum: 120,
        windowSeconds: 60,
        request,
        reply,
        traceId: context.traceId,
      });
      return publicProfile(result.profile);
    } catch (error) {
      this.grpcFailure({
        error,
        operation: 'authorize',
        request,
        traceId: context.traceId,
      });
    }
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
      this.fail({
        statusCode: 403,
        code: 'FORBIDDEN',
        detail: 'Request origin is not allowed',
        request,
        traceId,
      });
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
    scope,
    subject,
    maximum,
    windowSeconds,
    request,
    reply,
    traceId,
  }: {
    scope: string;
    subject: string;
    maximum: number;
    windowSeconds: number;
    request: FastifyRequest;
    reply: FastifyReply;
    traceId: string;
  }) {
    try {
      await this.rateLimiter.consume({
        scope,
        subject,
        maximum,
        windowSeconds,
      });
    } catch (error) {
      if (error instanceof RateLimitError) {
        reply.header('retry-after', error.retryAfter);
        this.fail({
          statusCode: 429,
          code: 'RATE_LIMIT_EXCEEDED',
          detail: 'Too many requests',
          request,
          traceId,
        });
      }
      this.fail({
        statusCode: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        detail: 'The service is temporarily unavailable',
        request,
        traceId,
      });
    }
  }

  private setCredentials(reply: FastifyReply, credentials: SessionCredentials) {
    reply.header('set-cookie', [
      this.cookie({
        name: 'dexa_access',
        value: credentials.accessToken,
        path: '/api',
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

  private grpcFailure({
    error,
    operation,
    request,
    traceId,
  }: {
    error: unknown;
    operation: 'login' | 'refresh' | 'authorize';
    request: FastifyRequest;
    traceId: string;
  }): never {
    if (error instanceof HttpException) {
      throw error;
    }
    const codeFromGrpc = grpcCode(error);
    if (codeFromGrpc === status.UNAUTHENTICATED) {
      if (operation === 'login') {
        this.fail({
          statusCode: 401,
          code: 'INVALID_CREDENTIALS',
          detail: 'Phone number or password is incorrect',
          request,
          traceId,
        });
      }
      this.fail({
        statusCode: 401,
        code: 'AUTHENTICATION_REQUIRED',
        detail: 'Authentication is required',
        request,
        traceId,
      });
    }
    if (codeFromGrpc === status.INVALID_ARGUMENT) {
      this.fail({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        detail: 'Request validation failed',
        request,
        traceId,
      });
    }
    if (codeFromGrpc === status.UNAVAILABLE) {
      this.fail({
        statusCode: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        detail: 'The service is temporarily unavailable',
        request,
        traceId,
      });
    }
    if (codeFromGrpc === status.DEADLINE_EXCEEDED) {
      this.fail({
        statusCode: 504,
        code: 'DOWNSTREAM_TIMEOUT',
        detail: 'The request timed out',
        request,
        traceId,
      });
    }
    this.fail({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      detail: 'An unexpected error occurred',
      request,
      traceId,
    });
  }

  private fail({
    statusCode,
    code,
    detail,
    request,
    traceId,
  }: {
    statusCode: number;
    code: string;
    detail: string;
    request: FastifyRequest;
    traceId: string;
  }): never {
    fail(statusCode, code, detail, request, traceId);
  }
}
