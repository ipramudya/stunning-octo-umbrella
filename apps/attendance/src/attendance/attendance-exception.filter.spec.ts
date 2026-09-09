import { status } from '@grpc/grpc-js';
import { lastValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { EvidenceError } from '../evidence/evidence.service.js';
import { ManualDecisionError } from '../manual-decision/manual-decision.service.js';
import { RegularAttendanceError } from '../regular-attendance/regular-attendance.helper.js';
import { AttendanceExceptionFilter } from './attendance-exception.filter.js';

describe('AttendanceExceptionFilter', () => {
  it.each([
    [new EvidenceError('EVIDENCE_NOT_FOUND'), status.NOT_FOUND],
    [new ManualDecisionError('REQUEST_IN_PROGRESS'), status.ABORTED],
    [
      new RegularAttendanceError('CLOCK_IN_REQUIRED'),
      status.FAILED_PRECONDITION,
    ],
  ])('maps %s to its public gRPC status', async (error, expectedStatus) => {
    const filter = new AttendanceExceptionFilter();

    await expect(lastValueFrom(filter.catch(error))).rejects.toMatchObject({
      code: expectedStatus,
      details: error.message,
    });
  });

  it('does not expose unexpected failures', async () => {
    const filter = new AttendanceExceptionFilter();

    await expect(
      lastValueFrom(filter.catch(new Error('database password leaked'))),
    ).rejects.toMatchObject({
      code: status.UNKNOWN,
      details: 'INTERNAL_ERROR',
    });
  });
});
