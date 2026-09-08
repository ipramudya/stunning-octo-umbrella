import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { connect } from "node:net";
import { OracleDatabase } from "./oracle.js";
import type { Environment } from "./config.schema.js";

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
  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly database: OracleDatabase,
  ) {}

  async isReady(): Promise<boolean> {
    const minio = new URL(this.config.get("MINIO_ENDPOINT", { infer: true }));
    try {
      const [minioReady] = await Promise.all([
        canConnect(minio.hostname, Number(minio.port || (minio.protocol === "https:" ? 443 : 80))),
        this.database.withConnection((connection) =>
          connection.execute(
            `SELECT SDO_GEOM.SDO_DISTANCE(
               MDSYS.SDO_GEOMETRY(2001, 4326, MDSYS.SDO_POINT_TYPE(0, 0, NULL), NULL, NULL),
               MDSYS.SDO_GEOMETRY(2001, 4326, MDSYS.SDO_POINT_TYPE(0, 0, NULL), NULL, NULL),
               0.05, 'unit=M')
             FROM attendance_zones WHERE ROWNUM = 1`,
          ),
        ),
      ]);
      return minioReady;
    } catch {
      return false;
    }
  }
}
