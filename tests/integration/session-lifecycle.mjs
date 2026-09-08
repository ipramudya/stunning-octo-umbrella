import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { composeExec, cookieJar, me, post } from './auth-http.mjs';

const password = process.env.DEMO_HRD_PASSWORD ?? 'DexaAdministrator1!';

async function login() {
  const response = await post('/api/v1/auth/login', {
    phoneNumber: '+6280000000001',
    password,
  });
  assert.equal(response.status, 200);
  return cookieJar(response);
}

function clearRateLimits() {
  const password = process.env.RATE_LIMIT_REDIS_PASSWORD ?? 'DexaRateLimit1!';
  composeExec(
    [
      'redis',
      'sh',
      '-c',
      `redis-cli --user gateway -a '${password}' --no-auth-warning --scan --pattern 'rate:*' | xargs -r redis-cli --user gateway -a '${password}' --no-auth-warning DEL >/dev/null`,
    ],
    { stdio: 'pipe' },
  );
}

const first = await login();
const originalRefresh = first.dexa_refresh;
const refreshed = await post('/api/v1/auth/refresh', undefined, first);
assert.equal(refreshed.status, 204);
const rotated = { ...first, ...cookieJar(refreshed) };
assert.notEqual(rotated.dexa_refresh, originalRefresh);
await post('/api/v1/auth/refresh', undefined, {
  dexa_refresh: originalRefresh,
});
assert.equal((await me(rotated)).status, 401);

clearRateLimits();
const concurrent = await login();
const attempts = await Promise.all([
  post('/api/v1/auth/refresh', undefined, concurrent),
  post('/api/v1/auth/refresh', undefined, concurrent),
]);
assert.deepEqual(
  attempts
    .map((response) => response.status)
    .sort((left, right) => left - right),
  [204, 401],
);
const invalid = await post('/api/v1/auth/refresh', undefined, {
  dexa_refresh: 'random-invalid-token',
});
assert.equal(invalid.status, 401);

clearRateLimits();
const sessions = [];
for (let index = 0; index < 5; index += 1) sessions.push(await login());
clearRateLimits();
sessions.push(await login());
assert.equal((await me(sessions[0])).status, 401);
assert.equal((await me(sessions[5])).status, 200);

clearRateLimits();
for (let index = 0; index < 5; index += 1) {
  const response = await post('/api/v1/auth/login', {
    phoneNumber: '+6280000000001',
    password: 'wrong-password',
  });
  assert.equal(response.status, 401);
}
const limited = await post('/api/v1/auth/login', {
  phoneNumber: '+6280000000001',
  password: 'wrong-password',
});
assert.equal(limited.status, 429);
assert.ok(Number(limited.headers.get('retry-after')) > 0);
assert.equal((await limited.json()).code, 'RATE_LIMIT_EXCEEDED');

const identityAcl = composeExec(
  [
    'redis',
    'redis-cli',
    '--user',
    'identity',
    '-a',
    process.env.REDIS_PASSWORD ?? 'DexaRedis1!',
    'SET',
    'rate:forbidden',
    '1',
  ],
  { encoding: 'utf8' },
);
assert.match(identityAcl, /NOPERM/);
const gatewayAcl = composeExec(
  [
    'redis',
    'redis-cli',
    '--user',
    'gateway',
    '-a',
    process.env.RATE_LIMIT_REDIS_PASSWORD ?? 'DexaRateLimit1!',
    'SET',
    'identity:forbidden',
    '1',
  ],
  { encoding: 'utf8' },
);
assert.match(gatewayAcl, /NOPERM/);

clearRateLimits();
const logoutJar = await login();
execFileSync('docker', ['compose', 'stop', 'redis'], { stdio: 'pipe' });
const unavailable = await post('/api/v1/auth/login', {
  phoneNumber: '+6280000000001',
  password,
});
assert.equal(unavailable.status, 503);
assert.equal((await unavailable.json()).code, 'DEPENDENCY_UNAVAILABLE');
const unavailableRefresh = await post(
  '/api/v1/auth/refresh',
  undefined,
  logoutJar,
);
assert.equal(unavailableRefresh.status, 503);
assert.equal((await unavailableRefresh.json()).code, 'DEPENDENCY_UNAVAILABLE');
const unavailableMe = await me(logoutJar);
assert.equal(unavailableMe.status, 503);
assert.equal((await unavailableMe.json()).code, 'DEPENDENCY_UNAVAILABLE');
const logout = await post('/api/v1/auth/logout', undefined, logoutJar);
assert.equal(logout.status, 204);
for (const cookie of logout.headers.getSetCookie()) {
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
}

console.log('Session lifecycle integration check passed.');
