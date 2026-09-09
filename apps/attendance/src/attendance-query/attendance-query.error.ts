import { status } from '@grpc/grpc-js';

export class AttendanceQueryError extends Error {
  constructor(
    readonly code: string,
    readonly grpcStatus = status.INVALID_ARGUMENT,
  ) {
    super(code);
  }
}
