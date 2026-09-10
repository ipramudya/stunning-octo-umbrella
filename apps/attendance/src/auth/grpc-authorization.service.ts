import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { status, type Metadata } from '@grpc/grpc-js';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { failure } from '../attendance/attendance.error.js';
import type { Environment } from '../config/config-typedef.js';
import { type InternalClaims, verifyInternalAccess } from './internal-token.js';

export function bearer(metadata: Metadata) {
  const value = metadata.get('authorization')[0];

  if (typeof value === 'string' && value.startsWith('Bearer ')) {
    return value.slice(7);
  }

  return '';
}

@Injectable()
export class GrpcAuthorizationService {
  private readonly authenticated = new WeakMap<Metadata, InternalClaims>();

  private readonly issuer: string;

  private readonly publicKey: string;

  constructor(config: ConfigService<Environment, true>) {
    this.issuer = config.get('JWT_ISSUER', { infer: true });
    this.publicKey = readFileSync(
      join(config.get('PKI_DIR', { infer: true }), 'identity-signing.pub'),
      'utf8',
    );
  }

  async authenticate(metadata: Metadata) {
    try {
      const claims = await verifyInternalAccess({
        token: bearer(metadata),
        publicKeyPem: this.publicKey,
        issuer: this.issuer,
      });

      this.authenticated.set(metadata, claims);

      return claims;
    } catch {
      failure(status.UNAUTHENTICATED, 'AUTHENTICATION_REQUIRED');
    }
  }

  claims(metadata: Metadata) {
    const claims = this.authenticated.get(metadata);

    if (!claims) {
      failure(status.UNAUTHENTICATED, 'AUTHENTICATION_REQUIRED');
    }

    return claims;
  }
}
