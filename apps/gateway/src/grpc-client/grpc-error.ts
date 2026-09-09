import { Metadata, type status } from '@grpc/grpc-js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function grpcCode(error: unknown): status | undefined {
  if (!isRecord(error)) {
    return undefined;
  }
  const code = error.code;
  if (typeof code === 'number') {
    return code;
  }
  return undefined;
}

export function grpcMetadata(error: unknown, key: string) {
  if (!isRecord(error)) {
    return undefined;
  }
  const metadata = error.metadata;
  if (!(metadata instanceof Metadata)) {
    return undefined;
  }
  const value = metadata.get(key)[0];
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
}

export function grpcErrorCode(error: unknown) {
  return grpcMetadata(error, 'x-error-code');
}
