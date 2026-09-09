import { status } from '@grpc/grpc-js';

import { AttendanceError } from '../attendance/attendance.error.js';

export type AttendanceQueryErrorCode =
  | 'ATTENDANCE_NOT_FOUND'
  | 'DATE_RANGE_TOO_LARGE'
  | 'INVALID_CURSOR'
  | 'VALIDATION_ERROR';

export class AttendanceQueryError extends AttendanceError {
  constructor(
    code: AttendanceQueryErrorCode,
    grpcStatus = status.INVALID_ARGUMENT,
  ) {
    super(code, grpcStatus);
  }
}
