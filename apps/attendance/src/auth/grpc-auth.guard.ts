import type { Metadata } from '@grpc/grpc-js';
import { CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import { AttendanceAuthorizationService } from '../attendance/attendance-authorization.service.js';

@Injectable()
export class GrpcAuthGuard implements CanActivate {
  constructor(private readonly authorization: AttendanceAuthorizationService) {}

  async canActivate(context: ExecutionContext) {
    await this.authorization.authenticate(
      context.switchToRpc().getContext<Metadata>(),
    );

    return true;
  }
}
