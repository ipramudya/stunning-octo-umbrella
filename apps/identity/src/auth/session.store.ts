import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { status } from '@grpc/grpc-js';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

import type { Environment } from '../config/config-typedef.js';
import { AuthError } from './auth-error.js';
import type { Session } from './auth.entity.js';

const CREATE_SESSION = `
local time = redis.call('TIME')
local now = tonumber(time[1])
local ttl = tonumber(ARGV[7])
local session = cjson.encode({
  employeeId = ARGV[3],
  credentialVersion = tonumber(ARGV[4]),
  createdAt = now,
  expiresAt = now + ttl,
  refreshDigest = ARGV[6]
})
redis.call('SET', ARGV[1] .. ARGV[2], session, 'EX', ttl)
redis.call('SET', ARGV[5] .. ARGV[6], ARGV[2], 'EX', ttl)
redis.call('ZADD', KEYS[1], now * 1000000 + tonumber(time[2]), ARGV[2])
redis.call('EXPIRE', KEYS[1], ttl)
while redis.call('ZCARD', KEYS[1]) > 5 do
  local oldSid = redis.call('ZRANGE', KEYS[1], 0, 0)[1]
  local old = redis.call('GET', ARGV[1] .. oldSid)
  if old then redis.call('DEL', ARGV[5] .. cjson.decode(old).refreshDigest) end
  redis.call('DEL', ARGV[1] .. oldSid)
  redis.call('ZREM', KEYS[1], oldSid)
end
return session`;

const ROTATE_SESSION = `
local sid = redis.call('GET', ARGV[2] .. ARGV[1])
if not sid then
  sid = redis.call('GET', ARGV[3] .. ARGV[1])
  if not sid then return {'INVALID'} end
  local session = redis.call('GET', ARGV[4] .. sid)
  if session then
    local decoded = cjson.decode(session)
    redis.call('DEL', ARGV[2] .. decoded.refreshDigest)
    redis.call('DEL', ARGV[4] .. sid)
    redis.call('ZREM', ARGV[5] .. decoded.employeeId, sid)
  end
  return {'REPLAY'}
end
local key = ARGV[4] .. sid
local session = redis.call('GET', key)
if not session then redis.call('DEL', ARGV[2] .. ARGV[1]); return {'INVALID'} end
local ttl = redis.call('TTL', key)
if ttl <= 0 then return {'INVALID'} end
local decoded = cjson.decode(session)
decoded.refreshDigest = ARGV[6]
local updated = cjson.encode(decoded)
redis.call('SET', key, updated, 'EX', ttl)
redis.call('DEL', ARGV[2] .. ARGV[1])
redis.call('SET', ARGV[2] .. ARGV[6], sid, 'EX', ttl)
redis.call('SET', ARGV[3] .. ARGV[1], sid, 'EX', ttl)
return {'OK', updated, sid}`;

const LOGOUT_SESSION = `
local sid = redis.call('GET', ARGV[2] .. ARGV[1]) or redis.call('GET', ARGV[3] .. ARGV[1])
if not sid then return 0 end
local session = redis.call('GET', ARGV[4] .. sid)
if session then
  local decoded = cjson.decode(session)
  redis.call('DEL', ARGV[2] .. decoded.refreshDigest)
  redis.call('DEL', ARGV[4] .. sid)
  redis.call('ZREM', ARGV[5] .. decoded.employeeId, sid)
end
return 1`;

const REVOKE_EMPLOYEE_SESSIONS = `
local sessionsKey = ARGV[1] .. ARGV[2]
local sids = redis.call('ZRANGE', sessionsKey, 0, -1)
for _, sid in ipairs(sids) do
  local session = redis.call('GET', ARGV[3] .. sid)
  if session then
    redis.call('DEL', ARGV[4] .. cjson.decode(session).refreshDigest)
    redis.call('DEL', ARGV[3] .. sid)
  end
end
redis.call('DEL', sessionsKey)
return #sids`;

const sessionPrefix = 'identity:session:';
const activePrefix = 'identity:refresh:active:';
const usedPrefix = 'identity:refresh:used:';
const employeePrefix = 'identity:employee-sessions:';

@Injectable()
export class SessionStore implements OnModuleDestroy {
  private readonly client: RedisClientType;

  private connection?: Promise<RedisClientType>;

  private readonly scriptShas = new Map<string, string>();

  constructor(private readonly config: ConfigService<Environment, true>) {
    this.client = createClient({
      url: config.get('REDIS_URL', { infer: true }),
      username: 'identity',
      password: config.get('REDIS_PASSWORD', { infer: true }),
      socket: { reconnectStrategy: false },
      disableOfflineQueue: true,
    });
    this.client.on('error', () => undefined);
  }

  async ping() {
    return (await this.redis()).ping();
  }

  async create(employeeId: string, credentialVersion: number) {
    const token = SessionStore.refreshToken();
    const sid = randomUUID();
    const ttl = this.config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true });
    const refreshDigest = SessionStore.digest(token);

    const result = await this.mutate(CREATE_SESSION, {
      keys: [`${employeePrefix}${employeeId}`],
      arguments: [
        sessionPrefix,
        sid,
        employeeId,
        String(credentialVersion),
        activePrefix,
        refreshDigest,
        String(ttl),
      ],
    });

    if (typeof result !== 'string') {
      throw new Error('invalid Redis response');
    }

    const session = SessionStore.parseSession(result);

    return { sid, session, refreshToken: token };
  }

  async get(sid: string) {
    const value = await (await this.redis()).get(`${sessionPrefix}${sid}`);

    if (value) {
      return SessionStore.parseSession(value);
    }

    return undefined;
  }

  async getByRefreshToken(token: string) {
    const client = await this.redis();

    const sid = await client.get(
      `${activePrefix}${SessionStore.digest(token)}`,
    );

    if (!sid) {
      return undefined;
    }

    const session = await this.get(sid);

    if (session) {
      return { sid, session };
    }

    return undefined;
  }

  async rotate(token: string) {
    const nextToken = SessionStore.refreshToken();
    const nextDigest = SessionStore.digest(nextToken);
    const result = SessionStore.stringArray(
      await this.mutate(ROTATE_SESSION, {
        arguments: [
          SessionStore.digest(token),
          activePrefix,
          usedPrefix,
          sessionPrefix,
          employeePrefix,
          nextDigest,
        ],
      }),
    );

    if (result[0] !== 'OK' || !result[1] || !result[2]) {
      throw new AuthError('AUTHENTICATION_REQUIRED', status.UNAUTHENTICATED);
    }

    return {
      sid: result[2],
      session: SessionStore.parseSession(result[1]),
      refreshToken: nextToken,
    };
  }

  async revoke(token: string) {
    await this.mutate(LOGOUT_SESSION, {
      arguments: [
        SessionStore.digest(token),
        activePrefix,
        usedPrefix,
        sessionPrefix,
        employeePrefix,
      ],
    });
  }

  async revokeEmployee(employeeId: string) {
    await this.mutate(REVOKE_EMPLOYEE_SESSIONS, {
      arguments: [employeePrefix, employeeId, sessionPrefix, activePrefix],
    });
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

  private static digest(token: string) {
    return createHash('sha256').update(token).digest('base64url');
  }

  private static refreshToken() {
    return randomBytes(32).toString('base64url');
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private static parseSession(json: string): Session {
    const value: unknown = JSON.parse(json);

    if (!SessionStore.isRecord(value)) {
      throw new Error('invalid session');
    }

    const {
      employeeId,
      credentialVersion,
      createdAt,
      expiresAt,
      refreshDigest,
    } = value;
    const hasIdentity =
      typeof employeeId === 'string' && typeof credentialVersion === 'number';
    const hasTimestamps =
      typeof createdAt === 'number' && typeof expiresAt === 'number';

    if (!hasIdentity || !hasTimestamps || typeof refreshDigest !== 'string') {
      throw new Error('invalid session');
    }

    return {
      employeeId,
      credentialVersion,
      createdAt,
      expiresAt,
      refreshDigest,
    };
  }

  private static stringArray(value: unknown) {
    if (
      !Array.isArray(value) ||
      !value.every((item) => typeof item === 'string')
    ) {
      throw new Error('invalid Redis response');
    }

    return value;
  }

  private async mutate(
    script: string,
    options: { keys?: string[]; arguments: string[] },
  ) {
    const client = await this.redis();

    let sha = this.scriptShas.get(script);
    if (!sha) {
      sha = await client.scriptLoad(script);
      this.scriptShas.set(script, sha);
    }

    try {
      return await client.evalSha(sha, options);
    } catch (error) {
      if (!String(error).includes('NOSCRIPT')) {
        throw error;
      }

      sha = await client.scriptLoad(script);
      this.scriptShas.set(script, sha);

      return client.evalSha(sha, options);
    }
  }
}
