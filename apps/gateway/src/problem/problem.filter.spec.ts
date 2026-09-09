import { HttpException, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ProblemFilter } from './problem.filter.js';

describe('ProblemFilter', () => {
  it('maps framework client errors without labeling them internal', () => {
    const send = vi.fn();
    const reply = {
      header: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      send,
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/missing' }),
        getResponse: () => reply,
      }),
    } as unknown as ArgumentsHost;

    new ProblemFilter().catch(new HttpException('Not Found', 404), host);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        title: 'Not Found',
        status: 404,
      }),
    );
  });

  it('redacts unexpected errors', () => {
    const send = vi.fn();
    const reply = {
      header: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      send,
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/api/v1/auth/me' }),
        getResponse: () => reply,
      }),
    } as unknown as ArgumentsHost;

    new ProblemFilter().catch(new Error('secret stack detail'), host);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INTERNAL_ERROR',
        detail: 'An unexpected error occurred',
        status: 500,
      }),
    );
    expect(JSON.stringify(send.mock.calls)).not.toContain(
      'secret stack detail',
    );
  });
});
