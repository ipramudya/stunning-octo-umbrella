import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { connect } from "node:net";
import type { Environment } from "./config.js";

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const finish = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1_000);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

@Injectable()
export class ReadinessService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  async isReady(): Promise<boolean> {
    const minio = new URL(this.config.get("MINIO_ENDPOINT", { infer: true }));
    const checks = await Promise.all([
      canConnect(
        this.config.get("ORACLE_HOST", { infer: true }),
        this.config.get("ORACLE_PORT", { infer: true }),
      ),
      canConnect(minio.hostname, Number(minio.port || (minio.protocol === "https:" ? 443 : 80))),
    ]);
    return checks.every(Boolean);
  }
}
