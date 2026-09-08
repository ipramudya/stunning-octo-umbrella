import { importSPKI, jwtVerify, type JWTPayload } from "jose";

export type InternalRole = "EMPLOYEE" | "HRD";
export type InternalClaims = JWTPayload & {
  sub: string;
  sid: string;
  roles: InternalRole[];
  aud: string;
};

export async function verifyInternalAccess(
  token: string,
  publicKeyPem: string,
  issuer: string,
  requiredRoles: InternalRole[] = [],
): Promise<InternalClaims> {
  const { payload, protectedHeader } = await jwtVerify(
    token,
    await importSPKI(publicKeyPem, "EdDSA"),
    {
      algorithms: ["EdDSA"],
      audience: "dexa-attendance",
      issuer,
      clockTolerance: 5,
      requiredClaims: ["sub", "sid", "roles", "iat", "exp"],
    },
  );
  if (
    protectedHeader.alg !== "EdDSA" ||
    protectedHeader.typ !== "at+jwt" ||
    payload.aud !== "dexa-attendance" ||
    typeof payload.sub !== "string" ||
    typeof payload.sid !== "string" ||
    !Array.isArray(payload.roles) ||
    !payload.roles.every((role) => role === "EMPLOYEE" || role === "HRD")
  ) {
    throw new Error("invalid access token");
  }
  const claims = payload as InternalClaims;
  if (!requiredRoles.every((role) => claims.roles.includes(role))) throw new Error("forbidden");
  return claims;
}
