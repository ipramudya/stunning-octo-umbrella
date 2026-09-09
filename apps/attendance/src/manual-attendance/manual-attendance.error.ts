export class ManualAttendanceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
