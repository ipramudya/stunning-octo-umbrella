import { resolve } from 'node:path';

import { z } from 'zod';

const endpoint = z.string().regex(/^[a-zA-Z0-9.-]+:\d+$/);
const port = z.coerce.number().int().min(1).max(65_535);

export const environmentSchema = z.object({
  APP_ORIGIN: z
    .url()
    .refine((value) => new URL(value).origin === value)
    .default('http://localhost:3000'),
  ATTENDANCE_GRPC_SERVER_NAME: z.string().default('attendance'),
  ATTENDANCE_GRPC_URL: endpoint.default('localhost:50052'),
  HOST: z.string().default('0.0.0.0'),
  HTTP_PORT: port.default(3000),
  IDENTITY_GRPC_SERVER_NAME: z.string().default('identity'),
  IDENTITY_GRPC_URL: endpoint.default('localhost:50051'),
  PKI_DIR: z.string().default(resolve(process.cwd(), '.local/dev/pki')),
  RATE_LIMIT_REDIS_PASSWORD: z.string().min(1).default('DexaRateLimit1!'),
  RATE_LIMIT_REDIS_URL: z.url().default('redis://localhost:6379'),
});

export type Environment = z.infer<typeof environmentSchema>;
