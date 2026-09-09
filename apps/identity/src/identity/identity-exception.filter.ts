import { status, Metadata } from '@grpc/grpc-js';
import { Catch, type RpcExceptionFilter } from '@nestjs/common';
import { throwError } from 'rxjs';

import { AuthError } from '../auth/auth-error.js';

@Catch()
export class IdentityExceptionFilter implements RpcExceptionFilter {
  catch(error: unknown) {
    const failure =
      error instanceof AuthError
        ? error
        : new AuthError('DEPENDENCY_UNAVAILABLE', status.UNAVAILABLE);
    const metadata = new Metadata();
    metadata.set('x-error-code', failure.code);
    return throwError(() => ({
      code: failure.grpcStatus,
      details: failure.code,
      metadata,
    }));
  }
}
