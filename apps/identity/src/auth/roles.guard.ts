import { status, type Metadata } from '@grpc/grpc-js';
import { CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { RoleName } from '../employee/employee.entity.js';
import { fail } from '../employee/employee.helper.js';
import { GrpcAuthorizationService } from './grpc-authorization.service.js';
import { ROLES_KEY } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: GrpcAuthorizationService,
  ) {}

  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles?.length) {
      return true;
    }

    const claims = this.authorization.claims(
      context.switchToRpc().getContext<Metadata>(),
    );

    if (!roles.some((role) => claims.roles.includes(role))) {
      fail('FORBIDDEN', status.PERMISSION_DENIED);
    }

    return true;
  }
}
