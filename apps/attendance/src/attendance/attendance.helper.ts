import { Metadata } from '@grpc/grpc-js';

export function bearer(metadata: Metadata) {
  const value = metadata.get('authorization')[0];
  if (typeof value === 'string' && value.startsWith('Bearer ')) {
    return value.slice(7);
  }
  return '';
}

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
  const nanos: unknown = Reflect.get(value, 'nanos');
  let numericSeconds = Number(seconds);
  if (typeof seconds === 'object' && seconds !== null) {
    numericSeconds =
      Number(Reflect.get(seconds, 'low')) +
      Number(Reflect.get(seconds, 'high')) * 0x1_0000_0000;
  }
  if (
    !Number.isFinite(numericSeconds) ||
    !Number.isFinite(Number(nanos ?? 0))
  ) {
    return undefined;
  }
  return new Date(numericSeconds * 1_000 + Number(nanos ?? 0) / 1_000_000);
}
