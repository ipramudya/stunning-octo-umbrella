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
    const oracle = this.config.get("ORACLE_CONNECT_STRING", { infer: true }).split("/")[0]!;
    const separator = oracle.lastIndexOf(":");
    const redis = new URL(this.config.get("REDIS_URL", { infer: true }));
    const checks = await Promise.all([
      canConnect(oracle.slice(0, separator), Number(oracle.slice(separator + 1))),
      canConnect(redis.hostname, Number(redis.port || 6379)),
    ]);
    return checks.every(Boolean);
  }
}
