import type { AttendanceEntry } from '@project/contracts';

export type AttendanceEntryRow = {
  ID: string;
  EMPLOYEE_ID: string;
  WORK_DATE: Date;
  CLOCK_TYPE: 'CLOCK_IN' | 'CLOCK_OUT';
  SOURCE: 'REGULAR' | 'MANUAL';
  STATUS: 'PENDING_REVIEW' | 'RECORDED' | 'REJECTED';
  OCCURRED_AT: Date | null;
  CLAIMED_AT: Date | null;
  SUBMITTED_AT: Date;
  ADDRESS: string | null;
  LATITUDE: number;
  LONGITUDE: number;
  ACCURACY_METERS: number | null;
  DISTANCE_METERS: number | null;
  REASON: string | null;
  EVIDENCE_ID: string | null;
  DECIDED_AT: Date | null;
  DECIDED_BY_EMPLOYEE_ID: string | null;
  DECISION_REASON: string | null;
};

export type IdempotencyRow = {
  REQUEST_HASH: string;
  STATUS: 'IN_PROGRESS' | 'COMPLETED';
  RESPONSE_BODY: string | null;
};

export type DecisionClaim =
  | { kind: 'new' }
  | { kind: 'mismatch' }
  | { kind: 'in-progress' }
  | { kind: 'completed'; response: AttendanceEntry };
