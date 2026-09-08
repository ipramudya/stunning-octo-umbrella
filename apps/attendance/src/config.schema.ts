import { resolve } from "node:path";
import { z } from "zod";

const port = z.coerce.number().int().min(1).max(65_535);
const positiveInteger = z.coerce.number().int().positive();

export const environmentSchema = z.object({
  GRPC_PORT: port.default(50052),
  HOST: z.string().default("0.0.0.0"),
  HTTP_PORT: port.default(3002),
  JWT_ISSUER: z.string().min(1).default("dexa-identity"),
  MINIO_ENDPOINT: z
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
    .default("http://localhost:9000"),
  ORACLE_CALL_TIMEOUT_MS: positiveInteger.default(2_500),
  ORACLE_CONNECT_STRING: z.string().min(1).default("localhost:1521/FREEPDB1"),
  ORACLE_PASSWORD: z.string().min(1).default("DexaAttendance1!"),
  ORACLE_POOL_MAX: positiveInteger.default(4),
  ORACLE_POOL_MIN: positiveInteger.default(1),
  ORACLE_POOL_QUEUE_TIMEOUT_MS: positiveInteger.default(3_000),
  ORACLE_USER: z.string().min(1).default("DEXA_ATTENDANCE"),
  PKI_DIR: z.string().default(resolve(process.cwd(), ".local/dev/pki")),
});

export type Environment = z.infer<typeof environmentSchema>;
