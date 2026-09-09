import { status, Metadata } from '@grpc/grpc-js';
import { Catch, type RpcExceptionFilter } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { throwError } from 'rxjs';

import { AttendanceError } from './attendance.error.js';

@Catch()
export class AttendanceExceptionFilter implements RpcExceptionFilter {
  catch(error: unknown) {
    if (error instanceof RpcException) {
      return throwError(() => error.getError());
    }

    let failure: AttendanceError;

    if (error instanceof AttendanceError) {
      failure = error;
    } else {
      failure = new AttendanceError('INTERNAL_ERROR', status.UNKNOWN);
    }

    const metadata = new Metadata();

    metadata.set('x-error-code', failure.code);

    if (failure.retryAfter !== undefined) {
      metadata.set('retry-after', String(failure.retryAfter));
    }

    return throwError(() => ({
      code: failure.grpcStatus,
      details: failure.code,
      metadata,
    }));
  }
}
