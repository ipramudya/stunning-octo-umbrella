import { status } from '@grpc/grpc-js';

export class AuthError extends Error {
  constructor(
    readonly code: string,
    readonly grpcStatus: status,
  ) {
    super(code);
  }
}
