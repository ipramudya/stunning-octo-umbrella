import { Injectable } from '@nestjs/common';
import oracledb, { type Connection } from 'oracledb';

import { OracleDatabase } from './oracle.js';

export type EvidenceUpload = {
  id: string;
  employeeId: string;
  status: 'AUTHORIZED' | 'FINALIZING' | 'ATTACHED';
  declaredContentType: string;
  declaredSizeBytes: number;
  stagingKey: string;
  stagingVersion: string | null;
  permanentKey: string | null;
  permanentVersion: string | null;
  expiresAt: Date;
};

type EvidenceRow = {
  ID: string;
  EMPLOYEE_ID: string;
  STATUS: EvidenceUpload['status'];
  DECLARED_CONTENT_TYPE: string;
  DECLARED_SIZE_BYTES: number;
  STAGING_KEY: string;
  STAGING_VERSION: string | null;
  PERMANENT_KEY: string | null;
  PERMANENT_VERSION: string | null;
  EXPIRES_AT: Date;
};

const select = `SELECT id, employee_id, state AS status, content_type AS declared_content_type,
  size_bytes AS declared_size_bytes, staging_key, staging_version,
  permanent_key, permanent_version, expires_at
  FROM evidence_uploads`;

function value(row: EvidenceRow): EvidenceUpload {
  return {
    id: row.ID,
    employeeId: row.EMPLOYEE_ID,
    status: row.STATUS,
    declaredContentType: row.DECLARED_CONTENT_TYPE,
    declaredSizeBytes: row.DECLARED_SIZE_BYTES,
    stagingKey: row.STAGING_KEY,
    stagingVersion: row.STAGING_VERSION,
    permanentKey: row.PERMANENT_KEY,
    permanentVersion: row.PERMANENT_VERSION,
    expiresAt: row.EXPIRES_AT,
  };
}

@Injectable()
export class EvidenceRepository {
  constructor(private readonly database: OracleDatabase) {}

  async create(upload: EvidenceUpload) {
    await this.database.withTransaction((connection) =>
      connection.execute(
        `INSERT INTO evidence_uploads (
          id, employee_id, state, content_type, size_bytes,
          staging_key, expires_at, created_at, updated_at
        ) VALUES (
          :id, :employeeId, 'AUTHORIZED', :contentType, :sizeBytes,
          :stagingKey, :expiresAt, SYSTIMESTAMP, SYSTIMESTAMP
        )`,
        {
          id: { val: upload.id, type: oracledb.STRING, maxSize: 36 },
          employeeId: {
            val: upload.employeeId,
            type: oracledb.STRING,
            maxSize: 36,
          },
          contentType: {
            val: upload.declaredContentType,
            type: oracledb.STRING,
            maxSize: 20,
          },
          sizeBytes: { val: upload.declaredSizeBytes, type: oracledb.NUMBER },
          stagingKey: {
            val: upload.stagingKey,
            type: oracledb.STRING,
            maxSize: 500,
          },
          expiresAt: {
            val: upload.expiresAt,
            type: oracledb.DB_TYPE_TIMESTAMP_TZ,
          },
        },
      ),
    );
  }

  get(id: string) {
    return this.database.withConnection(async (connection) => {
      const result = await connection.execute<EvidenceRow>(
        `${select} WHERE id = :id`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      return result.rows?.[0] ? value(result.rows[0]) : undefined;
    });
  }

  lock(
    id: string,
    work: (connection: Connection, upload: EvidenceUpload) => Promise<void>,
  ) {
    return this.database.withTransaction(async (connection) => {
      const result = await connection.execute<EvidenceRow>(
        `${select} WHERE id = :id FOR UPDATE`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const row = result.rows?.[0];
      if (!row) return false;
      await work(connection, value(row));
      return true;
    });
  }

  async finalizing(
    connection: Connection,
    upload: EvidenceUpload,
    version: string,
  ) {
    await connection.execute(
      `UPDATE evidence_uploads SET state = 'FINALIZING', staging_version = :version,
       permanent_key = :permanentKey, updated_at = SYSTIMESTAMP WHERE id = :id`,
      { id: upload.id, version, permanentKey: `evidence/${upload.id}` },
    );
  }

  async attached(connection: Connection, id: string, permanentVersion: string) {
    await connection.execute(
      `UPDATE evidence_uploads SET state = 'ATTACHED', permanent_version = :permanentVersion,
       attached_at = SYSTIMESTAMP, updated_at = SYSTIMESTAMP WHERE id = :id`,
      { id, permanentVersion },
    );
  }

  async removeExpiredUploads() {
    await this.database.withTransaction((connection) =>
      connection.execute(
        `DELETE FROM evidence_uploads
         WHERE state = 'AUTHORIZED' AND expires_at <= SYSTIMESTAMP`,
      ),
    );
  }

  finalizingUploads() {
    return this.database.withConnection(async (connection) => {
      const result = await connection.execute<EvidenceRow>(
        `${select} WHERE state = 'FINALIZING'`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      return (result.rows ?? []).map(value);
    });
  }
}
