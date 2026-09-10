import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import oracledb, { type Connection } from 'oracledb';

import { OracleDatabase } from '../oracle.js';

type IdempotencyRow = {
  REQUEST_HASH: string;
  STATUS: 'IN_PROGRESS' | 'COMPLETED';
  RESPONSE_BODY: string | null;
  CREATED_AT: Date;
  EXPIRES_AT: Date;
};

export type IdempotencyClaim<T> =
  | { kind: 'new'; createdAt: Date }
  | { kind: 'mismatch'; createdAt: Date }
  | { kind: 'in-progress'; createdAt: Date }
  | { kind: 'completed'; createdAt: Date; response: T };

type IdempotencyIdentity = {
  actorId: string;
  operation: string;
  key: string;
  hash: string;
};

@Injectable()
export class IdempotencyService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private cleanupTimer?: NodeJS.Timeout;

  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly database: OracleDatabase) {}

  async onApplicationBootstrap() {
    await this.cleanup(true);
    this.cleanupTimer ??= setInterval(
      () =>
        void this.cleanup().catch((error: unknown) =>
          this.logger.warn(`idempotency cleanup deferred: ${String(error)}`),
        ),
      60 * 60 * 1_000,
    ).unref();
  }

  onApplicationShutdown() {
    clearInterval(this.cleanupTimer);
  }

  async claim<T>({
    actorId,
    operation,
    key,
    hash,
    restore,
    createdAt = new Date(),
  }: IdempotencyIdentity & {
    restore: (body: string) => T;
    createdAt?: Date;
  }): Promise<IdempotencyClaim<T>> {
    try {
      return await this.database.withTransaction(async (connection) => {
        const current = await this.get(connection, {
          actorId,
          operation,
          key,
        });

        if (current && current.EXPIRES_AT.getTime() > Date.now()) {
          if (current.REQUEST_HASH !== hash) {
            return { kind: 'mismatch', createdAt: current.CREATED_AT };
          }

          if (current.STATUS === 'IN_PROGRESS') {
            return { kind: 'in-progress', createdAt: current.CREATED_AT };
          }

          if (!current.RESPONSE_BODY) {
            throw new Error('idempotency response missing');
          }

          return {
            kind: 'completed',
            createdAt: current.CREATED_AT,
            response: restore(current.RESPONSE_BODY),
          };
        }

        if (current) {
          await connection.execute(
            `DELETE FROM idempotency_records
             WHERE actor_employee_id = :actorId AND operation = :operation
               AND idempotency_key = :key`,
            { actorId, operation, key },
          );
        }

        await connection.execute(
          `INSERT INTO idempotency_records (
             actor_employee_id, operation, idempotency_key, request_hash,
             status, created_at, expires_at
           ) VALUES (
             :actorId, :operation, :key, :hash, 'IN_PROGRESS',
             :createdAt, :expiresAt
           )`,
          {
            actorId,
            operation,
            key,
            hash,
            createdAt: { val: createdAt, type: oracledb.DB_TYPE_TIMESTAMP_TZ },
            expiresAt: {
              val: new Date(createdAt.getTime() + 86_400_000),
              type: oracledb.DB_TYPE_TIMESTAMP_TZ,
            },
          },
        );

        return { kind: 'new', createdAt };
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        Reflect.get(error, 'errorNum') === 1
      ) {
        return this.claim({
          actorId,
          operation,
          key,
          hash,
          restore,
          createdAt,
        });
      }

      throw error;
    }
  }

  async complete(
    connection: Connection,
    input: IdempotencyIdentity & { responseStatus: number; response: unknown },
  ) {
    const { actorId, operation, key, hash, responseStatus, response } = input;

    const result = await connection.execute(
      `UPDATE idempotency_records
       SET status = 'COMPLETED', response_status = :responseStatus,
         response_body = :responseBody, completed_at = SYSTIMESTAMP
       WHERE actor_employee_id = :actorId AND operation = :operation
         AND idempotency_key = :key AND request_hash = :hash
         AND status = 'IN_PROGRESS'`,
      {
        actorId,
        operation,
        key,
        hash,
        responseStatus,
        responseBody: { val: JSON.stringify(response), type: oracledb.CLOB },
      },
    );

    if (result.rowsAffected !== 1) {
      throw new Error('idempotency claim disappeared');
    }
  }

  release({ actorId, operation, key, hash }: IdempotencyIdentity) {
    return this.database.withTransaction((connection) =>
      connection.execute(
        `DELETE FROM idempotency_records
         WHERE actor_employee_id = :actorId AND operation = :operation
           AND idempotency_key = :key AND request_hash = :hash
           AND status = 'IN_PROGRESS'`,
        { actorId, operation, key, hash },
      ),
    );
  }

  private cleanup(includeInProgress = false) {
    let condition = 'expires_at <= SYSTIMESTAMP';
    if (includeInProgress) {
      condition = `status = 'IN_PROGRESS' OR expires_at <= SYSTIMESTAMP`;
    }

    return this.database.withTransaction((connection) =>
      connection.execute(`DELETE FROM idempotency_records WHERE ${condition}`),
    );
  }

  private async get(
    connection: Connection,
    {
      actorId,
      operation,
      key,
    }: Pick<IdempotencyIdentity, 'actorId' | 'operation' | 'key'>,
  ) {
    const result = await connection.execute<IdempotencyRow>(
      `SELECT request_hash, status, response_body, created_at, expires_at
       FROM idempotency_records
       WHERE actor_employee_id = :actorId AND operation = :operation
         AND idempotency_key = :key
       FOR UPDATE`,
      { actorId, operation, key },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: { RESPONSE_BODY: { type: oracledb.STRING } },
      },
    );

    return result.rows?.[0];
  }
}
