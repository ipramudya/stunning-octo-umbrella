import { Metadata } from '@grpc/grpc-js';
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { bearer } from './grpc-authorization.service.js';
import { verifyInternalAccess } from './internal-token.js';

async function token(
  audience: string,
  roles: string[],
  expiration: string | number = '60s',
) {
  const keys = await generateKeyPair('EdDSA');

  const jwt = await new SignJWT({ sid: 'session', roles })
    .setProtectedHeader({ alg: 'EdDSA', typ: 'at+jwt' })
    .setIssuer('dexa-identity')
    .setAudience(audience)
    .setSubject('employee')
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(keys.privateKey);

  return { jwt, publicKey: await exportSPKI(keys.publicKey) };
}

describe('Attendance internal access tokens', () => {
  it('extracts bearer tokens', () => {
    const metadata = new Metadata();

    metadata.set('authorization', 'Bearer access-token');

    expect(bearer(metadata)).toBe('access-token');
    expect(bearer(new Metadata())).toBe('');
  });

  it('rejects the wrong audience', async () => {
    const value = await token('dexa-identity', ['EMPLOYEE']);

    await expect(
      verifyInternalAccess({
        token: value.jwt,
        publicKeyPem: value.publicKey,
        issuer: 'dexa-identity',
      }),
    ).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const value = await token('dexa-attendance', ['EMPLOYEE'], 0);

    await expect(
      verifyInternalAccess({
        token: value.jwt,
        publicKeyPem: value.publicKey,
        issuer: 'dexa-identity',
      }),
    ).rejects.toThrow();
  });

  it('rejects a token with an invalid signature', async () => {
    const value = await token('dexa-attendance', ['EMPLOYEE']);

    const other = await token('dexa-attendance', ['EMPLOYEE']);

    await expect(
      verifyInternalAccess({
        token: value.jwt,
        publicKeyPem: other.publicKey,
        issuer: 'dexa-identity',
      }),
    ).rejects.toThrow();
  });

  it('rejects callers without the required role', async () => {
    const value = await token('dexa-attendance', ['EMPLOYEE']);

    await expect(
      verifyInternalAccess({
        token: value.jwt,
        publicKeyPem: value.publicKey,
        issuer: 'dexa-identity',
        requiredRoles: ['HRD'],
      }),
    ).rejects.toThrow('forbidden');
  });
});
