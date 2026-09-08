import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  importPKCS8,
  importSPKI,
  jwtVerify,
  SignJWT,
  type JWTPayload,
} from 'jose';

import type { RoleName } from './auth.js';
import type { Environment } from './config.schema.js';

export type AccessClaims = JWTPayload & {
  sub: string;
  sid: string;
  roles: RoleName[];
  aud: string;
};

async function assertToken({
  token,
  publicKey,
  issuer,
  audience,
}: {
  token: string;
  publicKey: CryptoKey;
  issuer: string;
  audience: string;
}): Promise<AccessClaims> {
  const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
    algorithms: ['EdDSA'],
    audience,
    issuer,
    clockTolerance: 5,
    requiredClaims: ['sub', 'sid', 'roles', 'iat', 'exp'],
  });
  if (
    protectedHeader.alg !== 'EdDSA' ||
    protectedHeader.typ !== 'at+jwt' ||
    payload.aud !== audience ||
    typeof payload.sub !== 'string' ||
    typeof payload.sid !== 'string' ||
    !Array.isArray(payload.roles) ||
    !payload.roles.every((role) => role === 'EMPLOYEE' || role === 'HRD')
  ) {
    throw new Error('invalid access token');
  }
  const roles = payload.roles.filter(
    (role): role is RoleName => role === 'EMPLOYEE' || role === 'HRD',
  );
  return {
    ...payload,
    sub: payload.sub,
    sid: payload.sid,
    roles,
    aud: payload.aud,
  };
}

@Injectable()
export class TokenService {
  private readonly issuer: string;
  private readonly privateKey: Promise<CryptoKey>;
  private readonly publicKey: Promise<CryptoKey>;

  constructor(config: ConfigService<Environment, true>) {
    this.issuer = config.get('JWT_ISSUER', { infer: true });
    const pkiDir = config.get('PKI_DIR', { infer: true });
    this.privateKey = importPKCS8(
      readFileSync(join(pkiDir, 'identity-signing.key'), 'utf8'),
      'EdDSA',
    );
    this.publicKey = importSPKI(
      readFileSync(join(pkiDir, 'identity-signing.pub'), 'utf8'),
      'EdDSA',
    );
  }

  async sign({
    employeeId,
    sid,
    roles,
    audience,
    ttl,
  }: {
    employeeId: string;
    sid: string;
    roles: RoleName[];
    audience: string;
    ttl: number;
  }) {
    return new SignJWT({ sid, roles })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'at+jwt' })
      .setIssuer(this.issuer)
      .setAudience(audience)
      .setSubject(employeeId)
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(await this.privateKey);
  }

  verify(token: string, audience: string) {
    return this.publicKey.then((publicKey) =>
      assertToken({ token, publicKey, issuer: this.issuer, audience }),
    );
  }
}
