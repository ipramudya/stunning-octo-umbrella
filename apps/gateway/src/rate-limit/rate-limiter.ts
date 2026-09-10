import { createHash } from 'node:crypto';

import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

import type { Environment } from '../config/config-typedef.js';

const FIXED_WINDOW = `
local time = redis.call('TIME')
local now = tonumber(time[1])
local window = tonumber(ARGV[2])
local bucket = math.floor(now / window)
local key = ARGV[1] .. bucket
local count = redis.call('INCR', key)
if count == 1 then redis.call('EXPIRE', key, window + 1) end
return {count, ((bucket + 1) * window) - now}`;

export class RateLimitError extends Error {
  constructor(readonly retryAfter: number) {
    super('RATE_LIMIT_EXCEEDED');
  }
}

export function rateKey(value: string) {
  return createHash('sha256').update(value).digest('base64url');
}

@Injectable()
export class RateLimiter implements OnModuleDestroy {
  private readonly client: RedisClientType;

  private connection?: Promise<RedisClientType>;

  constructor(config: ConfigService<Environment, true>) {
    this.client = createClient({
      url: config.get('RATE_LIMIT_REDIS_URL', { infer: true }),
      username: 'gateway',
      password: config.get('RATE_LIMIT_REDIS_PASSWORD', { infer: true }),
      socket: { reconnectStrategy: false },
      disableOfflineQueue: true,
    });
    this.client.on('error', () => undefined);
  }

  async consume({
    scope,
    subject,
    maximum,
    windowSeconds,
  }: {
    scope: string;
    subject: string;
    maximum: number;
    windowSeconds: number;
  }) {
    const client = await this.redis();

    const result = await client.eval(FIXED_WINDOW, {
      arguments: [`rate:${scope}:${subject}:`, String(windowSeconds)],
    });

    if (
      !Array.isArray(result) ||
      typeof result[0] !== 'number' ||
      typeof result[1] !== 'number'
    ) {
      throw new Error('invalid rate limit response');
    }

    if (result[0] > maximum) {
      throw new RateLimitError(result[1]);
    }
  }

  async onModuleDestroy() {
    if (this.connection) {
      await this.client.close();
    }
  }

  private redis() {
    this.connection ??= this.client.connect().then(() => this.client);

    return this.connection;
  }
}
