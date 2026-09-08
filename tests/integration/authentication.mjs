import assert from "node:assert/strict";
import { composeExec, cookieJar, me, post } from "./auth-http.mjs";

async function problem(response, status, code) {
  assert.equal(response.status, status);
  assert.match(response.headers.get("content-type") ?? "", /^application\/problem\+json/);
  const value = await response.json();
  assert.equal(value.code, code);
  assert.equal(value.status, status);
  assert.ok(value.traceId);
  assert.equal(JSON.stringify(value).includes("grpc"), false);
  return value;
}

const employeeLogin = await post("/api/v1/auth/login", {
  phoneNumber: "  +6280000000002  ",
  password: process.env.DEMO_EMPLOYEE_PASSWORD ?? "DexaEmployee1!",
});
assert.equal(employeeLogin.status, 200);
assert.match(employeeLogin.headers.get("x-correlation-id") ?? "", /^[0-9a-f-]{36}$/);
const employee = await employeeLogin.json();
assert.deepEqual(employee.roles, ["EMPLOYEE"]);
assert.equal(employee.phoneNumber, "+6280000000002");
let jar = cookieJar(employeeLogin);
assert.ok(jar.dexa_access && jar.dexa_refresh);
for (const setCookie of employeeLogin.headers.getSetCookie()) {
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
}

const current = await me(jar);
assert.equal(current.status, 200);
assert.equal((await current.json()).id, employee.id);

const internalToken = composeExec(
  ["gateway", "node", "/app/tests/integration/request-internal-token.mjs", jar.dexa_access],
  { encoding: "utf8" },
).trim();
assert.ok(internalToken);
assert.throws(() =>
  composeExec(
    [
      "attendance",
      "node",
      "/app/tests/integration/request-internal-token.mjs",
      jar.dexa_access,
      "attendance",
    ],
    { stdio: "pipe" },
  ),
);

const roleCheck = `
import { readFileSync } from 'node:fs';
import { verifyInternalAccess } from './apps/attendance/dist/internal-token.js';
try {
  await verifyInternalAccess({ token: process.env.TOKEN, publicKeyPem: readFileSync('/app/.local/pki/identity-signing.pub', 'utf8'), issuer: 'dexa-identity', requiredRoles: ['HRD'] });
  process.exit(1);
} catch (error) {
  if (error.message !== 'forbidden') throw error;
}
`;
composeExec(
  ["-e", `TOKEN=${internalToken}`, "attendance", "node", "--input-type=module", "-e", roleCheck],
  { stdio: "pipe" },
);

const identityToken = composeExec(
  [
    "gateway",
    "node",
    "/app/tests/integration/request-internal-token.mjs",
    jar.dexa_access,
    "gateway",
    "TOKEN_AUDIENCE_IDENTITY",
  ],
  { encoding: "utf8" },
).trim();
const audienceCheck = `
import { readFileSync } from 'node:fs';
import { verifyInternalAccess } from './apps/attendance/dist/internal-token.js';
try {
  await verifyInternalAccess({ token: process.env.TOKEN, publicKeyPem: readFileSync('/app/.local/pki/identity-signing.pub', 'utf8'), issuer: 'dexa-identity' });
  process.exit(1);
} catch {}
`;
composeExec(
  [
    "-e",
    `TOKEN=${identityToken}`,
    "attendance",
    "node",
    "--input-type=module",
    "-e",
    audienceCheck,
  ],
  { stdio: "pipe" },
);

const tokenParts = internalToken.split(".");
tokenParts[2] = `${tokenParts[2][0] === "A" ? "B" : "A"}${tokenParts[2].slice(1)}`;
const invalidToken = tokenParts.join(".");
const expiredToken = composeExec(
  [
    "identity",
    "node",
    "--input-type=module",
    "-e",
    `
import { readFileSync } from 'node:fs';
import { importPKCS8, SignJWT } from 'jose';
const key = await importPKCS8(readFileSync('/app/.local/pki/identity-signing.key', 'utf8'), 'EdDSA');
console.log(await new SignJWT({ sid: 'expired', roles: ['EMPLOYEE'] })
  .setProtectedHeader({ alg: 'EdDSA', typ: 'at+jwt' })
  .setIssuer('dexa-identity')
  .setAudience('dexa-attendance')
  .setSubject('expired')
  .setIssuedAt(0)
  .setExpirationTime(1)
  .sign(key));
`,
  ],
  { encoding: "utf8" },
).trim();
const rejectedTokenCheck = `
import { readFileSync } from 'node:fs';
import { verifyInternalAccess } from './apps/attendance/dist/internal-token.js';
for (const token of [process.env.INVALID_TOKEN, process.env.EXPIRED_TOKEN]) {
  try {
    await verifyInternalAccess({ token, publicKeyPem: readFileSync('/app/.local/pki/identity-signing.pub', 'utf8'), issuer: 'dexa-identity' });
    process.exit(1);
  } catch {}
}
`;
composeExec(
  [
    "-e",
    `INVALID_TOKEN=${invalidToken}`,
    "-e",
    `EXPIRED_TOKEN=${expiredToken}`,
    "attendance",
    "node",
    "--input-type=module",
    "-e",
    rejectedTokenCheck,
  ],
  { stdio: "pipe" },
);

const oldRefresh = jar.dexa_refresh;
const refreshed = await post("/api/v1/auth/refresh", {}, jar);
assert.equal(refreshed.status, 204);
jar = { ...jar, ...cookieJar(refreshed) };
assert.notEqual(jar.dexa_refresh, oldRefresh);
await problem(
  await post("/api/v1/auth/refresh", {}, { dexa_refresh: oldRefresh }),
  401,
  "AUTHENTICATION_REQUIRED",
);
await problem(await me(jar), 401, "AUTHENTICATION_REQUIRED");

const staleLogin = await post("/api/v1/auth/login", {
  phoneNumber: "+6280000000002",
  password: process.env.DEMO_EMPLOYEE_PASSWORD ?? "DexaEmployee1!",
});
assert.equal(staleLogin.status, 200);
const staleJar = cookieJar(staleLogin);
composeExec(
  [
    "oracle",
    "sqlplus",
    "-s",
    `DEXA_IDENTITY/${process.env.IDENTITY_ORACLE_PASSWORD ?? "DexaIdentity1!"}@//localhost:1521/FREEPDB1`,
  ],
  {
    encoding: "utf8",
    input:
      "UPDATE employees SET credential_version = credential_version + 1 WHERE phone_number = '+6280000000002';\nCOMMIT;\nEXIT\n",
  },
);
await problem(await me(staleJar), 401, "AUTHENTICATION_REQUIRED");

const wrongPassword = await problem(
  await post("/api/v1/auth/login", {
    phoneNumber: "+6280000000002",
    password: "wrong-password",
  }),
  401,
  "INVALID_CREDENTIALS",
);
const unknownPhone = await problem(
  await post("/api/v1/auth/login", {
    phoneNumber: "+6280999999999",
    password: "wrong-password",
  }),
  401,
  "INVALID_CREDENTIALS",
);
assert.equal(wrongPassword.detail, unknownPhone.detail);

const hrdLogin = await post("/api/v1/auth/login", {
  phoneNumber: "+6280000000001",
  password: process.env.DEMO_HRD_PASSWORD ?? "DexaAdministrator1!",
});
assert.equal(hrdLogin.status, 200);
assert.deepEqual((await hrdLogin.json()).roles, ["EMPLOYEE", "HRD"]);

console.log("Authentication integration check passed.");
