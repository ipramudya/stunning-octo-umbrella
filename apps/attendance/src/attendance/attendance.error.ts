import { Metadata, type status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';

export class AttendanceError extends Error {
  constructor(
    readonly code: string,
    readonly grpcStatus: status,
    readonly retryAfter?: number,
  ) {
    super(code);
  }
}

export function failure(
  code: number,
  detail: string,
  retryAfter?: number,
): never {
  const metadata = new Metadata();

  metadata.set('x-error-code', detail);

  if (retryAfter !== undefined) {
    metadata.set('retry-after', String(retryAfter));
  }

  throw new RpcException({ code, details: detail, metadata });
}
