import { resolve } from "node:path";
import { z } from "zod";

const port = z.coerce.number().int().min(1).max(65_535);
const positiveInteger = z.coerce.number().int().positive();

export const environmentSchema = z.object({
  ACCESS_TOKEN_TTL_SECONDS: positiveInteger.default(900),
  ARGON2_MEMORY_COST: positiveInteger.default(19_456),
  ARGON2_PARALLELISM: positiveInteger.default(1),
  ARGON2_TIME_COST: positiveInteger.default(2),
  GRPC_PORT: port.default(50051),
  HOST: z.string().default("0.0.0.0"),
  HTTP_PORT: port.default(3001),
  JWT_ISSUER: z.string().min(1).default("dexa-identity"),
  ORACLE_CALL_TIMEOUT_MS: positiveInteger.default(2_500),
  ORACLE_CONNECT_STRING: z.string().min(1).default("localhost:1521/FREEPDB1"),
  ORACLE_PASSWORD: z.string().min(1).default("DexaIdentity1!"),
  ORACLE_POOL_MAX: positiveInteger.default(4),
  ORACLE_POOL_MIN: positiveInteger.default(1),
  ORACLE_POOL_QUEUE_TIMEOUT_MS: positiveInteger.default(3_000),
  ORACLE_USER: z.string().min(1).default("DEXA_IDENTITY"),
  PKI_DIR: z.string().default(resolve(process.cwd(), ".local/dev/pki")),
  REDIS_PASSWORD: z.string().min(1).default("DexaRedis1!"),
  REDIS_URL: z.url().default("redis://localhost:6379"),
  REFRESH_TOKEN_TTL_SECONDS: positiveInteger.default(604_800),
});

export type Environment = z.infer<typeof environmentSchema>;
