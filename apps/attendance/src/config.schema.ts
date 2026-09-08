import { resolve } from "node:path";
import { z } from "zod";

const port = z.coerce.number().int().min(1).max(65_535);

export const environmentSchema = z.object({
  GRPC_PORT: port.default(50052),
  HOST: z.string().default("0.0.0.0"),
  HTTP_PORT: port.default(3002),
  MINIO_ENDPOINT: z
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
    .default("http://localhost:9000"),
  ORACLE_HOST: z.string().default("localhost"),
  ORACLE_PORT: port.default(1521),
  PKI_DIR: z.string().default(resolve(process.cwd(), ".local/dev/pki")),
});

export type Environment = z.infer<typeof environmentSchema>;
