import { status, type Metadata } from '@grpc/grpc-js';
import { Injectable } from '@nestjs/common';

import { fail } from '../employee/employee.helper.js';
import { TokenService, type AccessClaims } from './tokens.js';

@Injectable()
export class GrpcAuthorizationService {
  private readonly authenticated = new WeakMap<Metadata, AccessClaims>();

  constructor(private readonly tokens: TokenService) {}

  async authenticate(metadata: Metadata) {
    const authorization = metadata.get('authorization')[0];
    let token = '';
    if (
      typeof authorization === 'string' &&
      authorization.startsWith('Bearer ')
    ) {
      token = authorization.slice(7);
    }

    try {
      const claims = await this.tokens.verify(token, 'dexa-identity');

      this.authenticated.set(metadata, claims);

      return claims;
    } catch {
      fail('AUTHENTICATION_REQUIRED', status.UNAUTHENTICATED);
    }
  }

  claims(metadata: Metadata) {
    const claims = this.authenticated.get(metadata);

    if (!claims) {
      fail('AUTHENTICATION_REQUIRED', status.UNAUTHENTICATED);
    }

    return claims;
  }
}
