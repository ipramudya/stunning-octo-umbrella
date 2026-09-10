// The HTTP helper mirrors fetch arguments used throughout this executable check.
// oxlint-disable max-params
import assert from 'node:assert/strict';

import {
  baseUrl,
  composeExec,
  cookieHeader,
  cookieJar,
  origin,
  post,
} from './auth-http.mjs';

function zoneRequest(path, jar, method = 'GET', body) {
  const headers = {};

  if (jar) {
    headers.cookie = cookieHeader(jar);
  }

  if (body) {
    headers['content-type'] = 'application/json';
    headers.origin = origin;
  }

  const options = { method, headers };

  if (body) {
    options.body = JSON.stringify(body);
  }

  return fetch(`${baseUrl}${path}`, options);
}

const employee = cookieJar(
  await post('/api/v1/auth/login', {
    phoneNumber: '+6280000000002',
    password: process.env.DEMO_EMPLOYEE_PASSWORD,
  }),
);
const hrd = cookieJar(
  await post('/api/v1/auth/login', {
    phoneNumber: '+6280000000001',
    password: process.env.DEMO_HRD_PASSWORD,
  }),
);

assert.equal((await zoneRequest('/api/v1/attendance-zone')).status, 401);

const initial = await zoneRequest('/api/v1/attendance-zone', employee);

assert.equal(initial.status, 200);
assert.deepEqual(await initial.json(), {
  name: 'Titan Center',
  address: 'Titan Center, Bintaro',
  latitude: -6.2806863,
  longitude: 106.7264211,
  radiusMeters: 500,
  active: true,
});

const update = {
  name: 'Titan Center Updated',
  address: 'Bintaro, South Tangerang',
  latitude: -6.2807,
  longitude: 106.7265,
  radiusMeters: 650,
  active: false,
};

assert.equal(
  (await zoneRequest('/api/v1/hrd/attendance-zone', employee, 'PATCH', update))
    .status,
  403,
);
assert.equal(
  (
    await zoneRequest('/api/v1/hrd/attendance-zone', hrd, 'PATCH', {
      ...update,
      radiusMeters: 49,
    })
  ).status,
  400,
);

const updated = await zoneRequest(
  '/api/v1/hrd/attendance-zone',
  hrd,
  'PATCH',
  update,
);

assert.equal(updated.status, 200);
assert.deepEqual(await updated.json(), update);

composeExec(['attendance', 'node', 'apps/attendance/dist/scripts/seed.js'], {
  stdio: 'inherit',
});

const preserved = await zoneRequest('/api/v1/attendance-zone', employee);

assert.deepEqual(await preserved.json(), update);

const databaseCheck = `
import assert from "node:assert/strict";
import oracledb from "oracledb";
import { AttendanceConflict, AttendanceZoneRepository } from "./apps/attendance/dist/attendance-zone/attendance-zone.repository.js";

const config = { user: process.env.ORACLE_USER, password: process.env.ORACLE_PASSWORD, connectString: process.env.ORACLE_CONNECT_STRING };
const connection = await oracledb.getConnection(config);
const employeeId = "00000000-0000-4000-8000-000000000099";
const workDate = new Date("2026-09-08T00:00:00Z");
try {
  const spatial = await connection.execute(
    "SELECT z.latitude, z.longitude, z.center.sdo_srid AS srid, z.center.sdo_point.x AS x, z.center.sdo_point.y AS y FROM attendance_zones z WHERE z.id = 1",
    {}, { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  assert.deepEqual(spatial.rows[0], { LATITUDE: -6.2807, LONGITUDE: 106.7265, SRID: 4326, X: 106.7265, Y: -6.2807 });

  await connection.execute("DELETE FROM attendance_entries WHERE employee_id = :employeeId", { employeeId });
  const insert = \`INSERT INTO attendance_entries
    (id, employee_id, work_date, clock_type, source, status, occurred_at, address,
     latitude, longitude)
    VALUES (:id, :employeeId, :workDate, 'CLOCK_IN', 'REGULAR', 'RECORDED',
      SYSTIMESTAMP, 'Test', 0, 0)\`;
  await connection.execute(insert, { id: "00000000-0000-4000-8000-000000000091", employeeId, workDate });
  await connection.commit();

  await assert.rejects(
    connection.execute(insert, { id: "00000000-0000-4000-8000-000000000092", employeeId, workDate }),
    (error) => error.errorNum === 1,
  );
  await connection.rollback();

  await connection.execute(insert.replace("'CLOCK_IN'", "'CLOCK_OUT'"), {
    id: "00000000-0000-4000-8000-000000000093", employeeId, workDate,
  });
  await connection.rollback();
  const rolledBack = await connection.execute(
    "SELECT COUNT(*) FROM attendance_entries WHERE id = :id",
    { id: "00000000-0000-4000-8000-000000000093" },
  );
  assert.equal(rolledBack.rows[0][0], 0);

  const database = {
    async withTransaction(work) {
      const value = await oracledb.getConnection(config);
      try { const result = await work(value); await value.commit(); return result; }
      catch (error) { await value.rollback(); throw error; }
      finally { await value.close(); }
    },
  };
  const repository = new AttendanceZoneRepository(database);
  await assert.rejects(
    repository.withAttendanceMutation(employeeId, workDate, (value) => value.execute(insert, {
      id: "00000000-0000-4000-8000-000000000094", employeeId, workDate,
    })),
    AttendanceConflict,
  );

  const first = repository.withAttendanceMutation(employeeId, workDate, async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  const started = Date.now();
  await Promise.all([first, repository.withAttendanceMutation(employeeId, workDate, async () => {})]);
  assert.ok(Date.now() - started >= 250, "zone-first locking must serialize mutations");

  await connection.execute("DELETE FROM attendance_entries WHERE employee_id = :employeeId", { employeeId });
  await connection.commit();
} finally {
  await connection.close();
}
`;

composeExec(
  ['attendance', 'node', '--input-type=module', '-e', databaseCheck],
  {
    stdio: 'inherit',
  },
);

const restore = {
  name: 'Titan Center',
  address: 'Titan Center, Bintaro',
  latitude: -6.2806863,
  longitude: 106.7264211,
  radiusMeters: 500,
  active: true,
};

assert.equal(
  (await zoneRequest('/api/v1/hrd/attendance-zone', hrd, 'PATCH', restore))
    .status,
  200,
);
console.log('attendance zone integration passed');
