import { randomUUID } from 'node:crypto';
import { STATUS_CODES } from 'node:http';

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { clientProblemCodes } from './problem.constant.js';
import { isProblem, type Problem } from './problem.js';

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const response =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const supplied = isProblem(response) ? response : undefined;
    const traceId = supplied?.traceId ?? request.id ?? randomUUID();
    const clientError = status >= 400 && status < 500;
    const title = STATUS_CODES[status] ?? 'Bad Request';
    const code = clientProblemCodes[status] ?? 'VALIDATION_ERROR';
    const problem: Problem = supplied
      ? { ...supplied, status, instance: request.url, traceId }
      : {
          type: 'about:blank',
          title: clientError ? title : 'Internal Server Error',
          status,
          detail: clientError ? title : 'An unexpected error occurred',
          instance: request.url,
          code: clientError ? code : 'INTERNAL_ERROR',
          traceId,
        };
    reply
      .header('x-correlation-id', traceId)
      .type('application/problem+json')
      .status(status)
      .send(problem);
  }
}
