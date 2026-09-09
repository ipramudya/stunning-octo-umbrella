import { importSPKI, jwtVerify, type JWTPayload } from 'jose';

export type InternalRole = 'EMPLOYEE' | 'HRD';
export type InternalClaims = JWTPayload & {
  sub: string;
  sid: string;
  roles: InternalRole[];
  aud: string;
};

function hasExpectedClaims(
  value: JWTPayload,
): value is JWTPayload & { sub: string; sid: string; aud: string } {
  return (
    value.aud === 'dexa-attendance' &&
    typeof value.sub === 'string' &&
    typeof value.sid === 'string'
  );
}

function parseRoles(value: unknown): InternalRole[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  if (
    !value.every(
      (role): role is InternalRole => role === 'EMPLOYEE' || role === 'HRD',
    )
  ) {
    return undefined;
  }
  return value;
}

export async function verifyInternalAccess({
  token,
  publicKeyPem,
  issuer,
  requiredRoles = [],
}: {
  token: string;
  publicKeyPem: string;
  issuer: string;
  requiredRoles?: InternalRole[];
}): Promise<InternalClaims> {
  const { payload, protectedHeader } = await jwtVerify(
    token,
    await importSPKI(publicKeyPem, 'EdDSA'),
    {
      algorithms: ['EdDSA'],
      audience: 'dexa-attendance',
      issuer,
      clockTolerance: 5,
      requiredClaims: ['sub', 'sid', 'roles', 'iat', 'exp'],
    },
  );
  const hasExpectedHeader =
    protectedHeader.alg === 'EdDSA' && protectedHeader.typ === 'at+jwt';
  if (!hasExpectedHeader) {
    throw new Error('invalid access token');
  }
  if (!hasExpectedClaims(payload)) {
    throw new Error('invalid access token');
  }
  const roles = parseRoles(payload.roles);
  if (!roles) {
    throw new Error('invalid access token');
  }
  if (!requiredRoles.every((role) => roles.includes(role))) {
    throw new Error('forbidden');
  }
  return {
    ...payload,
    sub: payload.sub,
    sid: payload.sid,
    roles,
    aud: payload.aud,
  };
}
