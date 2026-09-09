import { type Provider } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';

import {
  ATTENDANCE_HEALTH_CLIENT,
  IDENTITY_HEALTH_CLIENT,
} from '../health/grpc-health.client.js';
import type {
  AttendanceGrpcClient,
  IdentityGrpcClient,
} from './grpc-client.types.js';

export const ATTENDANCE_CLIENT = Symbol('ATTENDANCE_CLIENT');
export const IDENTITY_CLIENT = Symbol('IDENTITY_CLIENT');

export const grpcClientProviders: Provider[] = [
  {
    provide: ATTENDANCE_CLIENT,
    inject: [ATTENDANCE_HEALTH_CLIENT],
    useFactory: (client: ClientGrpc) =>
      client.getService<AttendanceGrpcClient>('AttendanceService'),
  },
  {
    provide: IDENTITY_CLIENT,
    inject: [IDENTITY_HEALTH_CLIENT],
    useFactory: (client: ClientGrpc) =>
      client.getService<IdentityGrpcClient>('IdentityService'),
  },
];
