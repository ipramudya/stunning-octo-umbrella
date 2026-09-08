import { resolve } from "node:path";
import { z } from "zod";

const port = z.coerce.number().int().min(1).max(65_535);

export const environmentSchema = z.object({
  GRPC_PORT: port.default(50051),
  HOST: z.string().default("0.0.0.0"),
  HTTP_PORT: port.default(3001),
  ORACLE_HOST: z.string().default("localhost"),
  ORACLE_PORT: port.default(1521),
  PKI_DIR: z.string().default(resolve(process.cwd(), ".local/dev/pki")),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: port.default(6379),
});

export type Environment = z.infer<typeof environmentSchema>;
