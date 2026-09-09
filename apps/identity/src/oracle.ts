import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import oracledb, { type Pool } from 'oracledb';

import type { Environment } from './config/config-typedef.js';

@Injectable()
export class OracleDatabase implements OnModuleDestroy {
  private pool?: Promise<Pool>;

  constructor(private readonly config: ConfigService<Environment, true>) {}

  getPool() {
    this.pool ??= oracledb.createPool({
      user: this.config.get('ORACLE_USER', { infer: true }),
      password: this.config.get('ORACLE_PASSWORD', { infer: true }),
      connectString: this.config.get('ORACLE_CONNECT_STRING', { infer: true }),
      poolMin: this.config.get('ORACLE_POOL_MIN', { infer: true }),
      poolMax: this.config.get('ORACLE_POOL_MAX', { infer: true }),
      poolIncrement: 1,
      queueTimeout: this.config.get('ORACLE_POOL_QUEUE_TIMEOUT_MS', {
        infer: true,
      }),
      sessionCallback: (connection, _requestedTag, callback) => {
        connection.callTimeout = this.config.get('ORACLE_CALL_TIMEOUT_MS', {
          infer: true,
        });
        connection
          .execute(`ALTER SESSION SET TIME_ZONE = '+00:00'`)
          .then(() => callback())
          .catch(callback);
      },
    });
    return this.pool;
  }

  async withConnection<T>(
    work: (connection: oracledb.Connection) => Promise<T>,
  ) {
    const connection = await (await this.getPool()).getConnection();
    try {
      return await work(connection);
    } finally {
      await connection.close();
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await (await this.pool).close(5);
    }
  }
}
