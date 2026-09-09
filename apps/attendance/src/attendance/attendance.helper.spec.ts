import { Metadata } from '@grpc/grpc-js';
import { describe, expect, it } from 'vitest';

import {
  bearer,
  grpcEntry,
  grpcTimestamp,
  protoDate,
} from './attendance.helper.js';

describe('attendance helpers', () => {
  it('extracts bearer tokens', () => {
    const metadata = new Metadata();

    metadata.set('authorization', 'Bearer access-token');

    expect(bearer(metadata)).toBe('access-token');
    expect(bearer(new Metadata())).toBe('');
  });

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
    expect(protoDate({ seconds: { low: 1, high: 0 }, nanos: 0 })).toEqual(
      new Date('1970-01-01T00:00:01.000Z'),
    );
    expect(protoDate({ seconds: 'invalid' })).toBeUndefined();
  });
});
