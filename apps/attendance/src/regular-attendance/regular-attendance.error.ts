export class RegularAttendanceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export class RegularAttendancePersistenceError extends Error {
  constructor(readonly code: 'IDEMPOTENCY_KEY_REUSED' | 'REQUEST_IN_PROGRESS') {
    super(code);
  }
}
