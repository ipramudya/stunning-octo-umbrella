// The HTTP helper mirrors fetch arguments used throughout this executable check.
// oxlint-disable max-params
import assert from "node:assert/strict";
import { baseUrl, cookieHeader, cookieJar, origin, post } from "./auth-http.mjs";
const password = "EmployeeInitial1!";
const nextPassword = "EmployeeChanged1!";

function request(path, method, jar, body) {
  const options = {
    method,
    headers: {
      cookie: cookieHeader(jar),
      ...(method === "GET" ? {} : { origin }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
  };
  if (body !== undefined) options.body = JSON.stringify(body);
  return fetch(`${baseUrl}${path}`, options);
}

async function expectProblem(response, status, code) {
  assert.equal(response.status, status);
  assert.match(response.headers.get("content-type") ?? "", /^application\/problem\+json/);
  const value = await response.json();
  assert.equal(value.code, code);
  assert.ok(value.traceId);
  assert.equal(JSON.stringify(value).includes("ORA-"), false);
  return value;
}

const hrdLogin = await post("/api/v1/auth/login", {
  phoneNumber: "+6280000000001",
  password: process.env.DEMO_HRD_PASSWORD ?? "DexaAdministrator1!",
});
assert.equal(hrdLogin.status, 200);
const hrd = cookieJar(hrdLogin);

const employeeLogin = await post("/api/v1/auth/login", {
  phoneNumber: "+6280000000002",
  password: process.env.DEMO_EMPLOYEE_PASSWORD ?? "DexaEmployee1!",
});
assert.equal(employeeLogin.status, 200);
const ordinary = cookieJar(employeeLogin);
await expectProblem(await request("/api/v1/hrd/employees", "GET", ordinary), 403, "FORBIDDEN");

const createdResponse = await request("/api/v1/hrd/employees", "POST", hrd, {
  employeeNumber: "  dexa-ticket-04  ",
  fullName: "  Ticket Employee  ",
  phoneNumber: "+6280400000001",
  email: "TICKET04@EXAMPLE.COM",
  password,
});
assert.equal(createdResponse.status, 201);
const created = await createdResponse.json();
assert.equal(created.employeeNumber, "DEXA-TICKET-04");
assert.equal(created.fullName, "Ticket Employee");
assert.equal(created.email, "ticket04@example.com");
assert.deepEqual(created.roles, ["EMPLOYEE"]);
assert.equal("password" in created || "passwordHash" in created, false);

for (const [body, code] of [
  [
    {
      employeeNumber: "dexa-ticket-04",
      fullName: "Other",
      phoneNumber: "+6280400000002",
      password,
    },
    "EMPLOYEE_NUMBER_ALREADY_EXISTS",
  ],
  [
    {
      employeeNumber: "DEXA-TICKET-05",
      fullName: "Other",
      phoneNumber: "+6280400000001",
      password,
    },
    "PHONE_NUMBER_ALREADY_EXISTS",
  ],
  [
    {
      employeeNumber: "DEXA-TICKET-06",
      fullName: "Other",
      phoneNumber: "+6280400000003",
      email: "ticket04@example.com",
      password,
    },
    "EMAIL_ALREADY_EXISTS",
  ],
]) {
  await expectProblem(await request("/api/v1/hrd/employees", "POST", hrd, body), 409, code);
}

const searchedResponse = await request("/api/v1/hrd/employees?q=ticket&limit=1", "GET", hrd);
assert.equal(searchedResponse.status, 200);
const searched = await searchedResponse.json();
assert.equal(searched.items.length, 1);
assert.equal(searched.pageInfo.hasNextPage, false);
assert.equal(searched.items[0].id, created.id);

const firstPageResponse = await request("/api/v1/hrd/employees?limit=1", "GET", hrd);
assert.equal(firstPageResponse.status, 200);
const firstPage = await firstPageResponse.json();
assert.equal(firstPage.items.length, 1);
assert.equal(firstPage.pageInfo.hasNextPage, true);
assert.ok(firstPage.pageInfo.nextCursor);
const secondPageResponse = await request(
  `/api/v1/hrd/employees?limit=1&cursor=${encodeURIComponent(firstPage.pageInfo.nextCursor)}`,
  "GET",
  hrd,
);
assert.equal(secondPageResponse.status, 200);
const secondPage = await secondPageResponse.json();
assert.notEqual(secondPage.items[0].id, firstPage.items[0].id);
await expectProblem(
  await request("/api/v1/hrd/employees?cursor=broken", "GET", hrd),
  400,
  "INVALID_CURSOR",
);
const wrongCursor = Buffer.from(
  JSON.stringify({ v: 1, endpoint: "attendance", employeeNumber: "DEX-001", id: created.id }),
).toString("base64url");
await expectProblem(
  await request(`/api/v1/hrd/employees?cursor=${wrongCursor}`, "GET", hrd),
  400,
  "INVALID_CURSOR",
);

const detail = await request(`/api/v1/hrd/employees/${created.id}`, "GET", hrd);
assert.equal(detail.status, 200);
assert.equal((await detail.json()).employeeNumber, "DEXA-TICKET-04");
await expectProblem(
  await request(`/api/v1/hrd/employees/${created.id}`, "PATCH", hrd, { employeeNumber: "CHANGED" }),
  400,
  "VALIDATION_ERROR",
);
const updated = await request(`/api/v1/hrd/employees/${created.id}`, "PATCH", hrd, {
  fullName: "Ticket Employee Updated",
  email: null,
});
assert.equal(updated.status, 200);
assert.equal((await updated.json()).email, undefined);

const createdLogin = await post("/api/v1/auth/login", {
  phoneNumber: "+6280400000001",
  password,
});
assert.equal(createdLogin.status, 200);
const stalePhoneSession = cookieJar(createdLogin);
const phoneUpdate = await request(`/api/v1/hrd/employees/${created.id}/phone-number`, "PUT", hrd, {
  phoneNumber: "+6280400000009",
});
assert.equal(phoneUpdate.status, 200);
await expectProblem(
  await request("/api/v1/hrd/employees", "GET", stalePhoneSession),
  401,
  "AUTHENTICATION_REQUIRED",
);

const relogin = await post("/api/v1/auth/login", { phoneNumber: "+6280400000009", password });
assert.equal(relogin.status, 200);
const stalePasswordSession = cookieJar(relogin);
const reset = await request(`/api/v1/hrd/employees/${created.id}/password`, "PUT", hrd, {
  password: nextPassword,
});
assert.equal(reset.status, 204);
await expectProblem(
  await request("/api/v1/hrd/employees", "GET", stalePasswordSession),
  401,
  "AUTHENTICATION_REQUIRED",
);
assert.equal(
  (await post("/api/v1/auth/login", { phoneNumber: "+6280400000009", password })).status,
  401,
);
assert.equal(
  (await post("/api/v1/auth/login", { phoneNumber: "+6280400000009", password: nextPassword }))
    .status,
  200,
);

console.log("Employee administration integration check passed.");
