export type ClockType = 'CLOCK_IN' | 'CLOCK_OUT';

export type RegularAttendanceEntry = {
  id: string;
  employeeId: string;
  workDate: string;
  clockType: ClockType;
  source: 'REGULAR';
  status: 'RECORDED';
  occurredAt: string;
  claimedAt: null;
  submittedAt: string;
  location: {
    address: null;
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    distanceMeters: number;
  };
  reason: null;
  evidenceId: string;
  decision: null;
};

export type AttemptRow = {
  REQUEST_HASH: string;
  STATUS: 'IN_PROGRESS' | 'COMPLETED';
  RESPONSE_BODY: string | null;
  CREATED_AT: Date;
  EXPIRES_AT: Date;
};

export type ExistingEntryRow = {
  CLOCK_TYPE: ClockType;
  STATUS: 'PENDING_REVIEW' | 'RECORDED' | 'REJECTED';
  OCCURRED_AT: Date | null;
};

export type ZoneRow = {
  ACTIVE: number;
  RADIUS_METERS: number;
  DISTANCE_METERS: number;
};
