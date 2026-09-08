import { randomUUID } from 'node:crypto';

import type { OnApplicationBootstrap } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import type { Connection } from 'oracledb';

import { EvidenceStore } from './evidence-store.js';
import {
  EvidenceRepository,
  type EvidenceUpload,
} from './evidence.repository.js';

type EvidenceAuthorization = { employeeId: string; roles: string[] };

const maximumEvidenceBytes = 5 * 1024 * 1024;
const uploadLifetimeSeconds = 5 * 60;
const accessLifetimeSeconds = 60;

export class EvidenceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function expectedMagic(contentType: string, bytes: Uint8Array) {
  const expected =
    contentType === 'image/jpeg'
      ? [0xff, 0xd8, 0xff]
      : [137, 80, 78, 71, 13, 10, 26, 10];
  return expected.every((byte, index) => bytes[index] === byte);
}

function objectVersion(stat: { versionId?: string | null }) {
  if (!stat.versionId) throw new EvidenceError('EVIDENCE_INVALID');
  return stat.versionId;
}

@Injectable()
export class EvidenceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EvidenceService.name);

  constructor(
    private readonly repository: EvidenceRepository,
    private readonly store: EvidenceStore,
  ) {}

  async onApplicationBootstrap() {
    await this.repository.removeExpiredUploads();
    for (const upload of await this.repository.finalizingUploads()) {
      try {
        await this.removePermanent(upload);
        await this.repository.recover(upload);
      } catch (error) {
        this.logger.warn(
          `evidence recovery deferred for ${upload.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async authorizeUpload(
    authorization: EvidenceAuthorization,
    contentType: string,
    sizeBytes: number,
  ) {
    if (contentType !== 'image/jpeg' && contentType !== 'image/png')
      throw new EvidenceError('EVIDENCE_INVALID');
    if (
      !Number.isInteger(sizeBytes) ||
      sizeBytes < 1 ||
      sizeBytes > maximumEvidenceBytes
    )
      throw new EvidenceError('EVIDENCE_INVALID');

    const id = randomUUID();
    const expiresAt = new Date(Date.now() + uploadLifetimeSeconds * 1000);
    const stagingKey = `staging/${authorization.employeeId}/${id}`;
    await this.repository.create({
      id,
      employeeId: authorization.employeeId,
      status: 'AUTHORIZED',
      declaredContentType: contentType,
      declaredSizeBytes: sizeBytes,
      stagingKey,
      stagingVersion: null,
      permanentKey: null,
      permanentVersion: null,
      expiresAt,
    });
    return {
      uploadId: id,
      method: 'PUT',
      url: await this.store.authorizeUpload(stagingKey, uploadLifetimeSeconds),
      headers: { 'Content-Type': contentType },
      expiresAt,
    };
  }

  async authorizeAccess(
    authorization: EvidenceAuthorization,
    evidenceId: string,
  ) {
    const upload = await this.repository.get(evidenceId);
    if (!upload) throw new EvidenceError('EVIDENCE_NOT_FOUND');
    if (
      upload.employeeId !== authorization.employeeId &&
      !authorization.roles.includes('HRD')
    )
      throw new EvidenceError('EVIDENCE_NOT_FOUND');
    if (
      upload.status !== 'ATTACHED' ||
      !upload.permanentKey ||
      !upload.permanentVersion
    )
      throw new EvidenceError('EVIDENCE_NOT_UPLOADED');
    const expiresAt = new Date(Date.now() + accessLifetimeSeconds * 1000);
    return {
      url: await this.store.authorizeAccess(
        upload.permanentKey,
        upload.permanentVersion,
        accessLifetimeSeconds,
      ),
      expiresAt,
    };
  }

  async prepare(connection: Connection, employeeId: string, uploadId: string) {
    const upload = await this.repository.getForUpdate(connection, uploadId);
    if (!upload || upload.employeeId !== employeeId)
      throw new EvidenceError('EVIDENCE_NOT_FOUND');
    return this.prepareUpload(connection, upload);
  }

  async promote(upload: EvidenceUpload) {
    if (!upload.stagingVersion || !upload.permanentKey)
      throw new EvidenceError('EVIDENCE_FINALIZATION_FAILED');
    try {
      let stat;
      try {
        stat = await this.store.stat(upload.permanentKey);
      } catch {
        await this.store.copy(
          upload.stagingKey,
          upload.stagingVersion,
          upload.permanentKey,
        );
        stat = await this.store.stat(upload.permanentKey);
      }
      const permanentVersion = objectVersion(stat);
      if (
        stat.size !== upload.declaredSizeBytes ||
        stat.metaData['content-type'] !== upload.declaredContentType ||
        !expectedMagic(
          upload.declaredContentType,
          await this.store.magic(upload.permanentKey, permanentVersion),
        )
      ) {
        await this.store.remove(upload.permanentKey, permanentVersion);
        throw new EvidenceError('EVIDENCE_FINALIZATION_FAILED');
      }
      return permanentVersion;
    } catch (error) {
      if (
        error instanceof EvidenceError &&
        error.code === 'EVIDENCE_FINALIZATION_FAILED'
      )
        throw error;
      throw new EvidenceError('EVIDENCE_FINALIZATION_FAILED');
    }
  }

  attach(connection: Connection, uploadId: string, permanentVersion: string) {
    return this.repository.attached(connection, uploadId, permanentVersion);
  }

  async abort(upload: EvidenceUpload) {
    await this.removePermanent(upload);
    await this.repository.reset(upload.id);
  }

  async cleanup(upload: EvidenceUpload) {
    if (upload.stagingVersion)
      await this.store.remove(upload.stagingKey, upload.stagingVersion);
  }

  async finalize(employeeId: string, uploadId: string) {
    let current: EvidenceUpload | undefined;
    const found = await this.repository.lock(
      uploadId,
      async (connection, upload) => {
        if (upload.employeeId !== employeeId)
          throw new EvidenceError('EVIDENCE_NOT_FOUND');
        current = await this.prepareUpload(connection, upload);
      },
    );
    if (!found || !current) throw new EvidenceError('EVIDENCE_NOT_FOUND');
    const permanentVersion = await this.promote(current);
    await this.repository.lock(uploadId, async (connection, upload) => {
      if (upload.status === 'FINALIZING')
        await this.repository.attached(connection, upload.id, permanentVersion);
    });
    await this.cleanup(current);
    return uploadId;
  }

  private async prepareUpload(connection: Connection, upload: EvidenceUpload) {
    if (upload.status === 'ATTACHED' || upload.status === 'FINALIZING')
      throw new EvidenceError('EVIDENCE_ALREADY_ATTACHED');
    if (upload.expiresAt.getTime() <= Date.now())
      throw new EvidenceError('EVIDENCE_EXPIRED');
    let stat;
    try {
      stat = await this.store.stat(upload.stagingKey);
    } catch {
      throw new EvidenceError('EVIDENCE_NOT_UPLOADED');
    }
    const version = objectVersion(stat);
    if (
      stat.size !== upload.declaredSizeBytes ||
      stat.size > maximumEvidenceBytes ||
      stat.metaData['content-type'] !== upload.declaredContentType ||
      !expectedMagic(
        upload.declaredContentType,
        await this.store.magic(upload.stagingKey, version),
      )
    )
      throw new EvidenceError('EVIDENCE_INVALID');
    await this.repository.finalizing(connection, upload, version);
    return {
      ...upload,
      status: 'FINALIZING' as const,
      stagingVersion: version,
      permanentKey: `evidence/${upload.id}`,
    };
  }

  private async removePermanent(upload: EvidenceUpload) {
    if (!upload.permanentKey) return;
    try {
      const stat = await this.store.stat(upload.permanentKey);
      if (stat.versionId)
        await this.store.remove(upload.permanentKey, stat.versionId);
    } catch {
      // The copy may not have started before the request stopped.
    }
  }
}
