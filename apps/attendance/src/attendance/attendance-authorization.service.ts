import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { status, type Metadata } from '@grpc/grpc-js';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AccessForbiddenError,
  type InternalRole,
  verifyInternalAccess,
} from '../auth/internal-token.js';
import type { Environment } from '../config/config-typedef.js';
import { failure } from './attendance.error.js';
import { bearer } from './attendance.helper.js';

@Injectable()
export class AttendanceAuthorizationService {
  private readonly issuer: string;
  private readonly publicKey: string;

  constructor(config: ConfigService<Environment, true>) {
    this.issuer = config.get('JWT_ISSUER', { infer: true });
    this.publicKey = readFileSync(
      join(config.get('PKI_DIR', { infer: true }), 'identity-signing.pub'),
      'utf8',
    );
  }

  async authorize(metadata: Metadata, roles: InternalRole[] = []) {
    try {
      return await verifyInternalAccess({
        token: bearer(metadata),
        publicKeyPem: this.publicKey,
        issuer: this.issuer,
        requiredRoles: roles,
      });
    } catch (error) {
      if (error instanceof AccessForbiddenError) {
        failure(status.PERMISSION_DENIED, 'FORBIDDEN');
      }

      failure(status.UNAUTHENTICATED, 'AUTHENTICATION_REQUIRED');
    }
  }
}
