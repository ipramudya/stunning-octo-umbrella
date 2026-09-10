import { status, Metadata } from '@grpc/grpc-js';
import { Catch, type RpcExceptionFilter } from '@nestjs/common';
import { throwError } from 'rxjs';

import { IdentityError } from './identity.error.js';

@Catch()
export class IdentityExceptionFilter implements RpcExceptionFilter {
  catch(error: unknown) {
    let failure: IdentityError;
    if (error instanceof IdentityError) {
      failure = error;
    } else {
      failure = new IdentityError('DEPENDENCY_UNAVAILABLE', status.UNAVAILABLE);
    }

    const metadata = new Metadata();

    metadata.set('x-error-code', failure.code);

    return throwError(() => ({
      code: failure.grpcStatus,
      details: failure.code,
      metadata,
    }));
  }
}
