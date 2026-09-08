import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type RedisClientType } from "redis";
import type { Session } from "./auth.js";
import { AuthError } from "./auth.js";
import { status } from "@grpc/grpc-js";
import type { Environment } from "./config.js";

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

const sessionPrefix = "identity:session:";
const activePrefix = "identity:refresh:active:";
const usedPrefix = "identity:refresh:used:";
const employeePrefix = "identity:employee-sessions:";

function digest(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function refreshToken() {
  return randomBytes(32).toString("base64url");
}

@Injectable()
export class SessionStore implements OnModuleDestroy {
  private readonly client: RedisClientType;
  private connection?: Promise<RedisClientType>;

  constructor(private readonly config: ConfigService<Environment, true>) {
    this.client = createClient({
      url: config.get("REDIS_URL", { infer: true }),
      password: config.get("REDIS_PASSWORD", { infer: true }),
    });
  }

  private redis() {
    this.connection ??= this.client.connect().then(() => this.client);
    return this.connection;
  }

  async create(employeeId: string, credentialVersion: number) {
    const token = refreshToken();
    const sid = randomUUID();
    const ttl = this.config.get("REFRESH_TOKEN_TTL_SECONDS", { infer: true });
    const refreshDigest = digest(token);
    const session = JSON.parse(
      (await (
        await this.redis()
      ).eval(CREATE_SESSION, {
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
      })) as string,
    ) as Session;
    return { sid, session, refreshToken: token };
  }

  async get(sid: string) {
    const value = await (await this.redis()).get(`${sessionPrefix}${sid}`);
    return value ? (JSON.parse(value) as Session) : undefined;
  }

  async getByRefreshToken(token: string) {
    const client = await this.redis();
    const sid = await client.get(`${activePrefix}${digest(token)}`);
    if (!sid) return undefined;
    const session = await this.get(sid);
    return session ? { sid, session } : undefined;
  }

  async rotate(token: string) {
    const nextToken = refreshToken();
    const nextDigest = digest(nextToken);
    const result = (await (
      await this.redis()
    ).eval(ROTATE_SESSION, {
      arguments: [
        digest(token),
        activePrefix,
        usedPrefix,
        sessionPrefix,
        employeePrefix,
        nextDigest,
      ],
    })) as string[];
    if (result[0] !== "OK" || !result[1] || !result[2]) {
      throw new AuthError("AUTHENTICATION_REQUIRED", status.UNAUTHENTICATED);
    }
    return {
      sid: result[2],
      session: JSON.parse(result[1]) as Session,
      refreshToken: nextToken,
    };
  }

  async revoke(token: string) {
    await (
      await this.redis()
    ).eval(LOGOUT_SESSION, {
      arguments: [digest(token), activePrefix, usedPrefix, sessionPrefix, employeePrefix],
    });
  }

  async onModuleDestroy() {
    if (this.connection) await this.client.close();
  }
}
