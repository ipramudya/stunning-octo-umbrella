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
    phoneNumber: '+6280000000002',
    password: process.env.DEMO_EMPLOYEE_PASSWORD ?? 'DexaEmployee1!',
  }),
);
const profile = await fetch(`${baseUrl}/api/v1/auth/me`, {
  headers: { cookie: cookieHeader(employee) },
});
assert.equal(profile.status, 200);
const employeeId = (await profile.json()).id;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function uploadEvidence(jar = employee) {
  const authorization = await fetch(`${baseUrl}/api/v1/me/evidence-uploads`, {
    method: 'POST',
    headers: {
      cookie: cookieHeader(jar),
      'content-type': 'application/json',
      origin,
    },
    body: JSON.stringify({ contentType: 'image/png', sizeBytes: png.length }),
  });
  assert.equal(authorization.status, 201);
  const upload = await authorization.json();
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
  return upload.uploadId;
}

const clockInUploadId = await uploadEvidence();
const clockOutUploadId = await uploadEvidence();
const regularCheck = `
import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./apps/attendance/dist/app.module.js";
import { RegularAttendanceService } from "./apps/attendance/dist/regular-attendance.service.js";
const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
try {
  const service = app.get(RegularAttendanceService);
  const workDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const location = { latitude: -6.2806863, longitude: 106.7264211, accuracyMeters: 10 };
  const clockIn = { ...location, clockType: "CLOCK_IN", evidenceUploadId: process.env.CLOCK_IN_UPLOAD_ID };
  const first = await service.create(process.env.EMPLOYEE_ID, "regular-clock-in", clockIn, new Date(workDate + "T01:00:00Z"));
  assert.equal(first.entry.status, "RECORDED");
  assert.equal(first.replayed, false);
  const replay = await service.create(process.env.EMPLOYEE_ID, "regular-clock-in", clockIn, new Date(workDate + "T01:30:00Z"));
  assert.equal(replay.entry.id, first.entry.id);
  assert.equal(replay.replayed, true);
  await assert.rejects(
    service.create(process.env.EMPLOYEE_ID, "regular-clock-in", { ...clockIn, accuracyMeters: 11 }, new Date(workDate + "T01:30:00Z")),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  const clockOut = await service.create(
    process.env.EMPLOYEE_ID,
    "regular-clock-out",
    { ...location, clockType: "CLOCK_OUT", evidenceUploadId: process.env.CLOCK_OUT_UPLOAD_ID },
    new Date(workDate + "T10:00:00Z"),
  );
  assert.equal(clockOut.entry.status, "RECORDED");
} finally {
  await app.close();
}
`;
composeExec(
  [
    '-e',
    `EMPLOYEE_ID=${employeeId}`,
    '-e',
    `CLOCK_IN_UPLOAD_ID=${clockInUploadId}`,
    '-e',
    `CLOCK_OUT_UPLOAD_ID=${clockOutUploadId}`,
    'attendance',
    'node',
    '--input-type=module',
    '--eval',
    regularCheck,
  ],
  { stdio: 'inherit' },
);

const manualUploadId = await uploadEvidence();
const workDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date(Date.now() - 86_400_000));
const manual = {
  clockType: 'CLOCK_IN',
  workDate,
  claimedAt: `${workDate}T05:00:00.000Z`,
  address: 'Titan Center, Bintaro',
  latitude: -6.2806863,
  longitude: 106.7264211,
  reason: 'Missed the regular attendance window.',
  evidenceUploadId: manualUploadId,
};
async function submitManual(
  body,
  key = 'manual-attendance-check',
  jar = employee,
) {
  return fetch(`${baseUrl}/api/v1/me/attendance/manual`, {
    method: 'POST',
    headers: {
      cookie: cookieHeader(jar),
      'content-type': 'application/json',
      'idempotency-key': key,
      origin,
    },
    body: JSON.stringify(body),
  });
}
const created = await submitManual(manual);
const createdBody = await created.json();
assert.equal(created.status, 201, JSON.stringify(createdBody));
assert.equal(createdBody.status, 'PENDING_REVIEW');
const replay = await submitManual(manual);
assert.equal(replay.status, 200);
assert.equal((await replay.json()).id, createdBody.id);
assert.equal(
  (await submitManual({ ...manual, reason: 'Changed reason.' })).status,
  409,
);

const hrd = cookieJar(
  await post('/api/v1/auth/login', {
    phoneNumber: '+6280000000001',
    password: process.env.DEMO_HRD_PASSWORD ?? 'DexaAdministrator1!',
  }),
);
async function hrdRequest(path, options = {}) {
  const { method = 'GET', key, body } = options;
  return fetch(`${baseUrl}/api/v1/hrd/attendance${path}`, {
    method,
    headers: {
      cookie: cookieHeader(hrd),
      ...(method === 'GET' ? {} : { origin, 'idempotency-key': key }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const pending = await hrdRequest('?limit=1');
assert.equal(pending.status, 200);
const pendingBody = await pending.json();
assert.equal(pendingBody.items.length, 1);
assert.equal(pendingBody.items[0].id, createdBody.id);
assert.equal(pendingBody.items[0].employee.id, employeeId);
const detail = await hrdRequest(`/${createdBody.id}`);
assert.equal(detail.status, 200);
assert.equal((await detail.json()).evidenceId, manualUploadId);
const evidenceAccess = await fetch(
  `${baseUrl}/api/v1/evidence/${manualUploadId}/access`,
  {
    method: 'POST',
    headers: { cookie: cookieHeader(hrd), origin },
  },
);
assert.equal(evidenceAccess.status, 200);

const approved = await hrdRequest(`/${createdBody.id}/approve`, {
  method: 'POST',
  key: 'approve-manual-attendance',
});
assert.equal(approved.status, 200);
const approvedBody = await approved.json();
assert.equal(approvedBody.status, 'RECORDED');
assert.equal(approvedBody.occurredAt, manual.claimedAt);
assert.equal(
  approvedBody.decision.reviewer.id,
  '00000000-0000-4000-8000-000000000001',
);
const approvalReplay = await hrdRequest(`/${createdBody.id}/approve`, {
  method: 'POST',
  key: 'approve-manual-attendance',
});
assert.equal(approvalReplay.status, 200);
assert.deepEqual(await approvalReplay.json(), approvedBody);
assert.equal(
  (
    await hrdRequest(`/${createdBody.id}/reject`, {
      method: 'POST',
      key: 'reject-approved-attendance',
      body: { reason: 'Too late.' },
    })
  ).status,
  409,
);

const clockOutManual = {
  ...manual,
  clockType: 'CLOCK_OUT',
  claimedAt: `${workDate}T10:00:00.000Z`,
  evidenceUploadId: await uploadEvidence(),
};
const clockOutCreated = await submitManual(
  clockOutManual,
  'manual-clock-out-check',
);
assert.equal(clockOutCreated.status, 201);
const clockOutBody = await clockOutCreated.json();
const rejected = await hrdRequest(`/${clockOutBody.id}/reject`, {
  method: 'POST',
  key: 'reject-manual-attendance',
  body: { reason: ' Evidence does not match. ' },
});
assert.equal(rejected.status, 200);
const rejectedBody = await rejected.json();
assert.equal(rejectedBody.status, 'REJECTED');
assert.equal(rejectedBody.decision.reason, 'Evidence does not match.');

const hrdWorkDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date(Date.now() - 2 * 86_400_000));
const ownManual = {
  ...manual,
  workDate: hrdWorkDate,
  claimedAt: `${hrdWorkDate}T05:00:00.000Z`,
  evidenceUploadId: await uploadEvidence(hrd),
};
const ownCreated = await submitManual(ownManual, 'hrd-own-manual', hrd);
assert.equal(ownCreated.status, 201);
const ownBody = await ownCreated.json();
const selfDecision = await hrdRequest(`/${ownBody.id}/approve`, {
  method: 'POST',
  key: 'self-approve-manual',
});
assert.equal(selfDecision.status, 403);
assert.equal((await selfDecision.json()).code, 'SELF_APPROVAL_FORBIDDEN');

console.log('Attendance submission and decision integration check passed.');
