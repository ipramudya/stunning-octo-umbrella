import { status } from '@grpc/grpc-js';
import { lastValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { IdentityExceptionFilter } from './identity-exception.filter.js';
import { IdentityError } from './identity.error.js';

describe('IdentityExceptionFilter', () => {
  it('preserves typed domain errors at the gRPC boundary', async () => {
    const filter = new IdentityExceptionFilter();

    await expect(
      lastValueFrom(
        filter.catch(
          new IdentityError('AUTHENTICATION_REQUIRED', status.UNAUTHENTICATED),
        ),
      ),
    ).rejects.toMatchObject({
      code: status.UNAUTHENTICATED,
      details: 'AUTHENTICATION_REQUIRED',
    });
  });

  it('hides unexpected errors as dependency failures', async () => {
    const filter = new IdentityExceptionFilter();

    await expect(
      lastValueFrom(filter.catch(new Error('database password leaked'))),
    ).rejects.toMatchObject({
      code: status.UNAVAILABLE,
      details: 'DEPENDENCY_UNAVAILABLE',
    });
  });
});
