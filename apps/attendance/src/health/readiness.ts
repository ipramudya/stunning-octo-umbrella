import { connect } from 'node:net';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../config/config-typedef.js';
import { EvidenceService } from '../evidence/evidence.service.js';
import { OracleDatabase } from '../oracle.js';

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const finish = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1_000);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

@Injectable()
export class ReadinessService {
  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly database: OracleDatabase,
    private readonly evidence: EvidenceService,
  ) {}

  async isReady(): Promise<boolean> {
    if (!this.evidence.recoveryComplete) {
      return false;
    }

    const minio = new URL(this.config.get('MINIO_ENDPOINT', { infer: true }));

    try {
      let defaultPort = 80;

      if (minio.protocol === 'https:') {
        defaultPort = 443;
      }

      const [minioReady] = await Promise.all([
        canConnect(minio.hostname, Number(minio.port || defaultPort)),
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
