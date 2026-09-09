import type { Metadata } from '@grpc/grpc-js';
import { status } from '@grpc/grpc-js';
import { CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AttendanceAuthorizationService } from '../attendance/attendance-authorization.service.js';
import { failure } from '../attendance/attendance.error.js';
import type { InternalRole } from './internal-token.js';
import { ROLES_KEY } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AttendanceAuthorizationService,
  ) {}

  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<InternalRole[]>(ROLES_KEY, [
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
      failure(status.PERMISSION_DENIED, 'FORBIDDEN');
    }

    return true;
  }
}
