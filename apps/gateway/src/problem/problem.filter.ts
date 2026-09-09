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
    let status = 500;
    let response;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      response = exception.getResponse();
    }

    let supplied;

    if (isProblem(response)) {
      supplied = response;
    }

    const traceId = supplied?.traceId ?? request.id ?? randomUUID();
    const clientError = status >= 400 && status < 500;
    const title = STATUS_CODES[status] ?? 'Bad Request';
    const code = clientProblemCodes[status] ?? 'VALIDATION_ERROR';
    let problem: Problem;

    if (supplied) {
      problem = { ...supplied, status, instance: request.url, traceId };
    } else if (clientError) {
      problem = {
        type: 'about:blank',
        title,
        status,
        detail: title,
        instance: request.url,
        code,
        traceId,
      };
    } else {
      problem = {
        type: 'about:blank',
        title: 'Internal Server Error',
        status,
        detail: 'An unexpected error occurred',
        instance: request.url,
        code: 'INTERNAL_ERROR',
        traceId,
      };
    }

    reply
      .header('x-correlation-id', traceId)
      .type('application/problem+json')
      .status(status)
      .send(problem);
  }
}
