import { ClockType } from '@project/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AttendanceConflict } from '../attendance-zone/attendance-zone.error.js';
import { ManualAttendanceService } from './manual-attendance.service.js';

const now = new Date('2026-09-08T03:00:00.000Z');
const request = {
  clockType: ClockType.CLOCK_TYPE_CLOCK_OUT,
  workDate: '2026-09-08',
  claimedAt: new Date('2026-09-08T01:15:00.000Z'),
  address: 'Titan Center, Bintaro',
  latitude: -6.2806863,
  longitude: 106.7264211,
  reason: 'Tidak dapat melakukan absensi reguler.',
  evidenceUploadId: 'a0124287-f066-44a0-9e9d-b33c362e050f',
};

function subject() {
  const repository = {
    recoverIdempotencyRecords: vi.fn(),
    claim: vi.fn().mockResolvedValue({ kind: 'new' }),
    create: vi
      .fn()
      .mockImplementation(({ entry }: { entry: unknown }) => entry),
    release: vi.fn(),
  };
  const upload = {
    id: request.evidenceUploadId,
    employeeId: 'employee-1',
    status: 'FINALIZING',
    stagingVersion: 'staging-version',
  };
  const evidence = {
    prepareStandalone: vi.fn().mockResolvedValue(upload),
    promote: vi.fn().mockResolvedValue('permanent-version'),
    complete: vi.fn(),
    abort: vi.fn(),
  };
  return {
    repository,
    evidence,
    service: new ManualAttendanceService(
      repository as never,
      evidence as never,
    ),
  };
}

describe('manual attendance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => vi.useRealTimers());

  it('creates a pending manual clock-out without requiring a clock-in', async () => {
    const { service, repository, evidence } = subject();
    const result = await service.create('employee-1', 'request-1', request);
    expect(result).toMatchObject({
      replay: false,
      entry: {
        workDate: request.workDate,
        evidenceId: request.evidenceUploadId,
      },
    });
    expect(repository.create).toHaveBeenCalledOnce();
    expect(evidence.complete).toHaveBeenCalledOnce();
  });

  it('returns completed replays without touching evidence', async () => {
    const { service, repository, evidence } = subject();
    repository.claim.mockResolvedValue({
      kind: 'completed',
      response: { id: 'entry-1' },
    });
    await expect(
      service.create('employee-1', 'request-1', request),
    ).resolves.toEqual({
      replay: true,
      entry: { id: 'entry-1' },
    });
    expect(evidence.prepareStandalone).not.toHaveBeenCalled();
  });

  it('releases the key and evidence when the singleton slot is taken', async () => {
    const { service, repository, evidence } = subject();
    repository.create.mockRejectedValue(new AttendanceConflict());
    await expect(
      service.create('employee-1', 'request-1', request),
    ).rejects.toMatchObject({
      code: 'ATTENDANCE_ALREADY_EXISTS',
    });
    expect(evidence.abort).toHaveBeenCalledOnce();
    expect(repository.release).toHaveBeenCalledOnce();
  });
});
