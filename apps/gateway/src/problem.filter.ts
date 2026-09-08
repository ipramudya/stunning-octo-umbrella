import { randomUUID } from "node:crypto";
import { STATUS_CODES } from "node:http";
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

const clientCodes: Partial<Record<number, string>> = {
  401: "AUTHENTICATION_REQUIRED",
  403: "FORBIDDEN",
  429: "RATE_LIMIT_EXCEEDED",
};

type Problem = {
  type: "about:blank";
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  traceId: string;
};

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const response = exception instanceof HttpException ? exception.getResponse() : undefined;
    const supplied = typeof response === "object" ? (response as Partial<Problem>) : undefined;
    const traceId = supplied?.traceId ?? randomUUID();
    const clientError = status >= 400 && status < 500;
    const title = STATUS_CODES[status] ?? "Bad Request";
    const code = clientCodes[status] ?? "VALIDATION_ERROR";
    const problem: Problem =
      supplied?.type === "about:blank" && supplied.code
        ? ({ ...supplied, status, instance: request.url, traceId } as Problem)
        : {
            type: "about:blank",
            title: clientError ? title : "Internal Server Error",
            status,
            detail: clientError ? title : "An unexpected error occurred",
            instance: request.url,
            code: clientError ? code : "INTERNAL_ERROR",
            traceId,
          };
    reply
      .header("x-correlation-id", traceId)
      .type("application/problem+json")
      .status(status)
      .send(problem);
  }
}
