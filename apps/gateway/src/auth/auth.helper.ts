import type { FastifyRequest } from 'fastify';

export function cookies(request: FastifyRequest) {
  return Object.fromEntries(
    (request.headers.cookie ?? '').split(';').flatMap((part) => {
      const index = part.indexOf('=');

      if (index < 0) {
        return [];
      }

      return [[part.slice(0, index).trim(), part.slice(index + 1)]];
    }),
  );
}
