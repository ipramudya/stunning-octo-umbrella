import { STATUS_CODES } from 'node:http';

import { HttpException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export type Problem = {
  type: 'about:blank';
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  traceId: string;
};

export function isProblem(value: unknown): value is Problem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    Reflect.get(value, 'type') === 'about:blank' &&
    typeof Reflect.get(value, 'title') === 'string' &&
    typeof Reflect.get(value, 'status') === 'number' &&
    typeof Reflect.get(value, 'detail') === 'string' &&
    typeof Reflect.get(value, 'instance') === 'string' &&
    typeof Reflect.get(value, 'code') === 'string' &&
    typeof Reflect.get(value, 'traceId') === 'string'
  );
}

export function fail(
  ...[statusCode, code, detail, request, traceId]: [
    number,
    string,
    string,
    Pick<FastifyRequest, 'url'>,
    string,
  ]
): never {
  throw new HttpException(
    {
      type: 'about:blank',
      title: STATUS_CODES[statusCode] ?? 'Internal Server Error',
      status: statusCode,
      detail,
      instance: request.url,
      code,
      traceId,
    } satisfies Problem,
    statusCode,
  );
}
