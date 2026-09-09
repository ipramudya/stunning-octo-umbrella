import type { AttendanceEntry } from '@project/contracts';

export type IdempotencyRow = {
  REQUEST_HASH: string;
  STATUS: 'IN_PROGRESS' | 'COMPLETED';
  RESPONSE_BODY: string | null;
};

export type IdempotencyClaim =
  | { kind: 'new' }
  | { kind: 'mismatch' }
  | { kind: 'in-progress' }
  | { kind: 'completed'; response: AttendanceEntry };
