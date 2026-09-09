import { ManualAttendanceDecision } from '@project/contracts';
import { describe, expect, it, vi } from 'vitest';

import { ManualDecisionPersistenceError } from './manual-decision.repository.js';
import { ManualDecisionError } from './manual-decision.service.js';
import { ManualDecisionService } from './manual-decision.service.js';

const approve = {
  entryId: 'a0124287-f066-44a0-9e9d-b33c362e050f',
  decision: ManualAttendanceDecision.MANUAL_ATTENDANCE_DECISION_APPROVE,
};

function subject() {
  const repository = {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    claim: vi.fn().mockResolvedValue({ kind: 'new' }),
    decide: vi.fn().mockResolvedValue({ id: approve.entryId }),
    release: vi.fn(),
  };

  return {
    repository,
    service: new ManualDecisionService(repository as never),
  };
}

describe('manual attendance decisions', () => {
  it('returns exact completed replays without deciding again', async () => {
    const { repository, service } = subject();

    repository.claim.mockResolvedValue({
      kind: 'completed',
      response: { id: approve.entryId, status: 'RECORDED' },
    });

    await expect(
      service.decide('reviewer-1', 'key-1', approve),
    ).resolves.toEqual({
      entry: { id: approve.entryId, status: 'RECORDED' },
      replay: true,
    });
    expect(repository.decide).not.toHaveBeenCalled();
  });

  it('releases failed claims and preserves the domain error', async () => {
    const { repository, service } = subject();

    repository.decide.mockRejectedValue(
      new ManualDecisionPersistenceError('SELF_APPROVAL_FORBIDDEN'),
    );

    await expect(
      service.decide('reviewer-1', 'key-1', approve),
    ).rejects.toEqual(new ManualDecisionError('SELF_APPROVAL_FORBIDDEN'));
    expect(repository.release).toHaveBeenCalledWith(
      'reviewer-1',
      'key-1',
      expect.any(String),
    );
  });

  it('requires a rejection reason', async () => {
    const { service } = subject();

    await expect(
      service.decide('reviewer-1', 'key-1', {
        ...approve,
        decision: ManualAttendanceDecision.MANUAL_ATTENDANCE_DECISION_REJECT,
        reason: '   ',
      }),
    ).rejects.toEqual(new ManualDecisionError('VALIDATION_ERROR'));
  });
});
