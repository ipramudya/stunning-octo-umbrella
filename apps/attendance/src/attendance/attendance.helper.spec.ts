import { describe, expect, it } from 'vitest';

import { grpcEntry, grpcTimestamp, protoDate } from './attendance.helper.js';

describe('attendance helpers', () => {
  it('converts dates to protobuf timestamps', () => {
    const date = new Date('1970-01-01T00:00:01.234Z');

    expect(grpcTimestamp(date)).toEqual({
      seconds: 1,
      nanos: 234_000_000,
    });
    expect(
      grpcEntry({
        occurredAt: date,
        submittedAt: date,
        decision: { decidedAt: date, reason: 'approved' },
      }),
    ).toEqual({
      occurredAt: { seconds: 1, nanos: 234_000_000 },
      claimedAt: undefined,
      submittedAt: { seconds: 1, nanos: 234_000_000 },
      decision: {
        decidedAt: { seconds: 1, nanos: 234_000_000 },
        reason: 'approved',
      },
    });
  });

  it('converts protobuf timestamps to dates', () => {
    const date = new Date('1970-01-01T00:00:01.500Z');

    expect(protoDate(date)).toBe(date);
    expect(protoDate({ seconds: 1, nanos: 500_000_000 })).toEqual(date);
    expect(protoDate({ seconds: 'invalid' })).toBeUndefined();
  });
});
