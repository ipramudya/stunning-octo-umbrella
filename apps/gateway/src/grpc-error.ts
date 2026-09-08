import { Metadata, type status } from '@grpc/grpc-js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function grpcCode(error: unknown): status | undefined {
  if (!isRecord(error)) return undefined;
  const code = error.code;
  return typeof code === 'number' ? code : undefined;
}

export function grpcErrorCode(error: unknown) {
  if (!isRecord(error)) return undefined;
  const metadata = error.metadata;
  if (!(metadata instanceof Metadata)) return undefined;
  const value = metadata.get('x-error-code')[0];
  return typeof value === 'string' ? value : undefined;
}
