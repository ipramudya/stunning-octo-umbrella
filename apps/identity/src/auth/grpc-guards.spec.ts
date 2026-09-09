import { Metadata, status } from '@grpc/grpc-js';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { GrpcAuthGuard } from './grpc-auth.guard.js';
import { GrpcAuthorizationService } from './grpc-authorization.service.js';
import { RolesGuard } from './roles.guard.js';
import type { TokenService } from './tokens.js';

function executionContext(metadata: Metadata) {
  return {
    getClass: vi.fn(),
    getHandler: vi.fn(),
    switchToRpc: () => ({ getContext: () => metadata }),
  } as unknown as ExecutionContext;
}

function authorization(roles: ('EMPLOYEE' | 'HRD')[] = ['HRD']) {
  const tokens = {
    verify: vi.fn().mockResolvedValue({ sub: 'employee', roles }),
  };

  return {
    service: new GrpcAuthorizationService(tokens as unknown as TokenService),
    tokens,
  };
}

describe('Identity gRPC guards', () => {
  it('allows a valid token with the required role', async () => {
    const metadata = new Metadata();
    const { service } = authorization();
    const context = executionContext(metadata);
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['HRD']) };

    metadata.set('authorization', 'Bearer valid');

    await expect(new GrpcAuthGuard(service).canActivate(context)).resolves.toBe(
      true,
    );
    expect(
      new RolesGuard(reflector as unknown as Reflector, service).canActivate(
        context,
      ),
    ).toBe(true);
  });

  it('rejects a token without the required role', async () => {
    const metadata = new Metadata();
    const { service } = authorization(['EMPLOYEE']);
    const context = executionContext(metadata);
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['HRD']) };

    metadata.set('authorization', 'Bearer valid');

    await new GrpcAuthGuard(service).canActivate(context);

    expect(() =>
      new RolesGuard(reflector as unknown as Reflector, service).canActivate(
        context,
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        grpcStatus: status.PERMISSION_DENIED,
      }),
    );
  });

  it('rejects an invalid token', async () => {
    const metadata = new Metadata();
    const { service, tokens } = authorization();

    metadata.set('authorization', 'Bearer invalid');
    tokens.verify.mockRejectedValue(new Error('invalid token'));

    await expect(
      new GrpcAuthGuard(service).canActivate(executionContext(metadata)),
    ).rejects.toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
      grpcStatus: status.UNAUTHENTICATED,
    });
  });
});
