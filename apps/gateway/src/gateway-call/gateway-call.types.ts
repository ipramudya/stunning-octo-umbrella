import type { CallOptions, Metadata } from '@grpc/grpc-js';
import type { TokenAudience } from '@project/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Observable } from 'rxjs';

export type GatewayCallContext = {
  metadata(audience: TokenAudience): Metadata;
  options: Partial<CallOptions>;
  cancelled: Observable<unknown>;
  traceId: string;
};

export type GatewayCall<T> = {
  request: FastifyRequest;
  reply: FastifyReply;
  audiences: readonly TokenAudience[];
  operation(context: GatewayCallContext): Promise<T>;
  failure?(error: unknown, traceId: string): never;
  rateLimited?: boolean;
  unsafe?: boolean;
  idempotent?: boolean;
};
