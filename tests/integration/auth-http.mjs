import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

export const origin = process.env.APP_ORIGIN ?? 'http://localhost:3000';
export const baseUrl = origin.replace('localhost', '127.0.0.1');

export function composeExec(args, options) {
  return execFileSync('docker', ['compose', 'exec', '-T', ...args], options);
}

export function cookieJar(response) {
  return Object.fromEntries(
    response.headers.getSetCookie().map((value) => {
      const [pair] = value.split(';', 1);
      const index = pair.indexOf('=');
      return [pair.slice(0, index), pair.slice(index + 1)];
    }),
  );
}

export function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

// Positional arguments keep these executable checks concise.
// oxlint-disable-next-line max-params
export function request(path, method, jar, body) {
  const headers = {};
  if (jar) {
    headers.cookie = cookieHeader(jar);
  }
  if (method !== 'GET') {
    headers.origin = origin;
  }
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  const options = { method, headers };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  return fetch(`${baseUrl}${path}`, options);
}

export async function expectProblem(response, status, code) {
  assert.equal(response.status, status);
  assert.match(
    response.headers.get('content-type') ?? '',
    /^application\/problem\+json/,
  );
  const value = await response.json();
  assert.equal(value.code, code);
  assert.ok(value.traceId);
  assert.equal(JSON.stringify(value).includes('ORA-'), false);
  return value;
}

export function post(path, body, jar) {
  const headers = { origin };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (jar) {
    headers.cookie = cookieHeader(jar);
  }
  const options = { method: 'POST', headers };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  return fetch(`${baseUrl}${path}`, options);
}

export function me(jar) {
  return fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: { cookie: cookieHeader(jar) },
  });
}
