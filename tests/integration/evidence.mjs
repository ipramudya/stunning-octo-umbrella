import assert from 'node:assert/strict';

import {
  baseUrl,
  composeExec,
  cookieHeader,
  cookieJar,
  origin,
  post,
} from './auth-http.mjs';

const employee = cookieJar(
  await post('/api/v1/auth/login', {
    phoneNumber: '+6280400000009',
    password: 'EmployeeChanged1!',
  }),
);
const profileResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
  headers: { cookie: cookieHeader(employee) },
});
assert.equal(profileResponse.status, 200);
const employeeId = (await profileResponse.json()).id;
const hrd = cookieJar(
  await post('/api/v1/auth/login', {
    phoneNumber: '+6280000000001',
    password: process.env.DEMO_HRD_PASSWORD ?? 'DexaAdministrator1!',
  }),
);
const otherPassword = 'EvidenceOther1!';
const otherCreation = await fetch(`${baseUrl}/api/v1/hrd/employees`, {
  method: 'POST',
  headers: {
    cookie: cookieHeader(hrd),
    'content-type': 'application/json',
    origin,
  },
  body: JSON.stringify({
    employeeNumber: 'DEXA-EVIDENCE-OTHER',
    fullName: 'Evidence Other',
    phoneNumber: '+6280600000001',
    password: otherPassword,
  }),
});
assert.equal(otherCreation.status, 201);
const other = cookieJar(
  await post('/api/v1/auth/login', {
    phoneNumber: '+6280600000001',
    password: otherPassword,
  }),
);

async function authorize(jar, body) {
  return fetch(`${baseUrl}/api/v1/me/evidence-uploads`, {
    method: 'POST',
    headers: {
      cookie: cookieHeader(jar),
      'content-type': 'application/json',
      origin,
    },
    body: JSON.stringify(body),
  });
}

async function access(jar, uploadId) {
  return fetch(`${baseUrl}/api/v1/evidence/${uploadId}/access`, {
    method: 'POST',
    headers: { cookie: cookieHeader(jar), origin },
  });
}

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
assert.equal(
  (await authorize(employee, { contentType: 'text/plain', sizeBytes: 8 }))
    .status,
  400,
);
assert.equal(
  (
    await authorize(employee, {
      contentType: 'image/png',
      sizeBytes: 5 * 1024 * 1024 + 1,
    })
  ).status,
  400,
);
const authorized = await authorize(employee, {
  contentType: 'image/png',
  sizeBytes: png.length,
});
const authorizedBody = await authorized.json();
assert.equal(authorized.status, 201, JSON.stringify(authorizedBody));
const upload = authorizedBody;
assert.equal(upload.method, 'PUT');
assert.deepEqual(upload.headers, { 'Content-Type': 'image/png' });
assert.ok(upload.url.startsWith(`http://localhost:${process.env.MINIO_PORT}/`));
assert.equal(
  (
    await fetch(upload.url, {
      method: 'PUT',
      headers: upload.headers,
      body: png,
    })
  ).status,
  200,
);
assert.equal((await access(employee, upload.uploadId)).status, 409);
assert.equal((await access(other, upload.uploadId)).status, 404);

const finalize = `
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./apps/attendance/dist/app.module.js";
import { EvidenceService } from "./apps/attendance/dist/evidence.service.js";
const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
try {
  await app.get(EvidenceService).finalize(process.env.EMPLOYEE_ID, process.env.UPLOAD_ID);
  if (process.env.EXPECT_ERROR) process.exitCode = 1;
} catch (error) {
  if (error.code !== process.env.EXPECT_ERROR) throw error;
} finally {
  await app.close();
}
`;
function finalizeUpload(uploadId, expectedError = '') {
  composeExec(
    [
      '-e',
      `UPLOAD_ID=${uploadId}`,
      '-e',
      `EMPLOYEE_ID=${employeeId}`,
      '-e',
      `EXPECT_ERROR=${expectedError}`,
      'attendance',
      'node',
      '--input-type=module',
      '--eval',
      finalize,
    ],
    { stdio: 'inherit' },
  );
}

finalizeUpload(upload.uploadId);
for (const jar of [employee, hrd]) {
  const response = await access(jar, upload.uploadId);
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(typeof value.expiresAt, 'string', JSON.stringify(value));
  const accessLifetime = new Date(value.expiresAt).getTime() - Date.now();
  assert.ok(accessLifetime > 0 && accessLifetime <= 61_000);
  assert.deepEqual(
    Buffer.from(await (await fetch(value.url)).arrayBuffer()),
    png,
  );
}
assert.equal((await access(other, upload.uploadId)).status, 404);

const wrong = await (
  await authorize(employee, { contentType: 'image/png', sizeBytes: 8 })
).json();
await fetch(wrong.url, {
  method: 'PUT',
  headers: wrong.headers,
  body: Buffer.from([255, 216, 255, 0, 0, 0, 0, 0]),
});
finalizeUpload(wrong.uploadId, 'EVIDENCE_INVALID');

const expired = await (
  await authorize(employee, { contentType: 'image/png', sizeBytes: 8 })
).json();
await fetch(expired.url, {
  method: 'PUT',
  headers: expired.headers,
  body: png,
});
const expire = `
import oracledb from "oracledb";
const connection = await oracledb.getConnection({ user: process.env.ORACLE_USER, password: process.env.ORACLE_PASSWORD, connectString: process.env.ORACLE_CONNECT_STRING });
await connection.execute("UPDATE evidence_uploads SET expires_at = SYSTIMESTAMP - INTERVAL '1' MINUTE WHERE id = :id", { id: process.env.UPLOAD_ID }, { autoCommit: true });
await connection.close();
`;
composeExec(
  [
    '-e',
    `UPLOAD_ID=${expired.uploadId}`,
    'attendance',
    'node',
    '--input-type=module',
    '--eval',
    expire,
  ],
  { stdio: 'inherit' },
);
finalizeUpload(expired.uploadId, 'EVIDENCE_NOT_FOUND');

console.log('Private photo evidence integration check passed.');
