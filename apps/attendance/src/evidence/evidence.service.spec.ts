import { describe, expect, it, vi } from 'vitest';

import type { EvidenceUpload } from './evidence.entity.js';
import { EvidenceError } from './evidence.service.js';
import { EvidenceService } from './evidence.service.js';

const authorization = { employeeId: 'employee-1', roles: ['EMPLOYEE'] };
const upload: EvidenceUpload = {
  id: 'upload-1',
  employeeId: 'employee-1',
  status: 'AUTHORIZED',
  declaredContentType: 'image/png',
  declaredSizeBytes: 8,
  stagingKey: 'staging/employee-1/upload-1',
  stagingVersion: null,
  permanentKey: null,
  permanentVersion: null,
  expiresAt: new Date(Date.now() + 60_000),
};

function subject() {
  const repository = {
    create: vi.fn(),
    get: vi.fn(),
    lock: vi.fn(),
    finalizing: vi.fn(),
    attached: vi.fn(),
    reset: vi.fn(),
    recover: vi.fn(),
    removeExpiredUploads: vi.fn(),
    finalizingUploads: vi.fn().mockResolvedValue([]),
  };
  const store = {
    authorizeUpload: vi.fn().mockResolvedValue('http://upload'),
    authorizeAccess: vi.fn().mockResolvedValue('http://access'),
    stat: vi
      .fn()
      .mockResolvedValueOnce({
        size: 8,
        versionId: 'staging-version',
        metaData: { 'content-type': 'image/png' },
      })
      .mockResolvedValueOnce({
        size: 8,
        versionId: 'permanent-version',
        metaData: { 'content-type': 'image/png' },
      }),
    magic: vi
      .fn()
      .mockResolvedValue(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    copy: vi.fn(),
    remove: vi.fn(),
  };
  const attendance = {
    cleanupAttempts: vi.fn(),
    cleanupExpiredAttempts: vi.fn(),
  };
  return {
    repository,
    store,
    attendance,
    service: new EvidenceService(
      repository as never,
      store as never,
      attendance as never,
    ),
  };
}

describe('EvidenceService', () => {
  it('cleans expired uploads when recovery starts', async () => {
    const { service, repository } = subject();
    await service.onApplicationBootstrap();
    expect(repository.removeExpiredUploads).toHaveBeenCalledOnce();
    expect(service.recoveryComplete).toBe(true);
  });

  it('stays unready while finalization recovery is deferred', async () => {
    const { service, repository, store } = subject();
    repository.finalizingUploads.mockResolvedValue([
      { ...upload, status: 'FINALIZING', permanentKey: 'evidence/upload-1' },
    ]);
    store.stat.mockRejectedValue(new Error('minio unavailable'));
    repository.recover.mockRejectedValue(new Error('oracle unavailable'));

    await service.onApplicationBootstrap();

    expect(service.recoveryComplete).toBe(false);
  });

  it('authorizes only bounded JPEG or PNG uploads', async () => {
    const { service, repository } = subject();
    await expect(
      service.authorizeUpload(authorization, 'text/plain', 8),
    ).rejects.toMatchObject({
      code: 'EVIDENCE_INVALID',
    });
    const result = await service.authorizeUpload(authorization, 'image/png', 8);
    expect(result).toMatchObject({ method: 'PUT', url: 'http://upload' });
    expect(repository.create).toHaveBeenCalledOnce();
  });

  it('verifies and promotes the exact uploaded version', async () => {
    const { service, repository, store } = subject();
    repository.lock.mockImplementationOnce(
      async (
        _id,
        work: (connection: object, current: typeof upload) => Promise<void>,
      ) => {
        await work({}, upload);
        return true;
      },
    );

    const prepared = await service.prepareStandalone('employee-1', upload.id);
    await expect(service.promote(prepared)).resolves.toBe('permanent-version');
    expect(repository.finalizing).toHaveBeenCalledWith(
      {},
      upload,
      'staging-version',
    );
    expect(store.copy).not.toHaveBeenCalled();
    expect(repository.attached).not.toHaveBeenCalled();
  });

  it('hides evidence from non-owners and rejects unattached access', async () => {
    const { service, repository } = subject();
    repository.get.mockResolvedValue(upload);
    await expect(
      service.authorizeAccess(
        { employeeId: 'employee-2', roles: ['EMPLOYEE'] },
        upload.id,
      ),
    ).rejects.toEqual(new EvidenceError('EVIDENCE_NOT_FOUND'));
    await expect(
      service.authorizeAccess(authorization, upload.id),
    ).rejects.toEqual(new EvidenceError('EVIDENCE_NOT_UPLOADED'));
  });
});
