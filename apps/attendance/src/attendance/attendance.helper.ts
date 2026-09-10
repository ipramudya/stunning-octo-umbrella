export function grpcTimestamp(date: Date) {
  const milliseconds = date.getTime();

  return {
    seconds: Math.floor(milliseconds / 1_000),
    nanos: (milliseconds % 1_000) * 1_000_000,
  };
}

export function grpcEntry<
  T extends {
    occurredAt?: Date;
    claimedAt?: Date;
    submittedAt?: Date;
    decision?: { decidedAt?: Date };
  },
>(value: T) {
  let occurredAt;
  if (value.occurredAt) {
    occurredAt = grpcTimestamp(value.occurredAt);
  }

  let claimedAt;
  if (value.claimedAt) {
    claimedAt = grpcTimestamp(value.claimedAt);
  }

  let submittedAt;
  if (value.submittedAt) {
    submittedAt = grpcTimestamp(value.submittedAt);
  }

  let decision;
  if (value.decision?.decidedAt) {
    decision = {
      ...value.decision,
      decidedAt: grpcTimestamp(value.decision.decidedAt),
    };
  }

  return { ...value, occurredAt, claimedAt, submittedAt, decision };
}

export function protoDate(value: unknown) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const seconds: unknown = Reflect.get(value, 'seconds');
  const nanos: unknown = Reflect.get(value, 'nanos') ?? 0;

  if (typeof seconds !== 'number' || typeof nanos !== 'number') {
    return undefined;
  }

  return new Date(seconds * 1_000 + nanos / 1_000_000);
}
