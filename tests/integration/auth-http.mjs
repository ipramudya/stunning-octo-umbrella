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

export function post(path, body, jar) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      origin,
      ...(jar ? { cookie: cookieHeader(jar) } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function me(jar) {
  return fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: { cookie: cookieHeader(jar) },
  });
}
