import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ChannelCredentials } from '@grpc/grpc-js';
import { Transport, type GrpcOptions } from '@nestjs/microservices';
import {
  ATTENDANCE_PROTO_PATH,
  HEALTH_PROTO_PATH,
  IDENTITY_PROTO_PATH,
} from '@project/contracts';

export const ATTENDANCE_HEALTH_CLIENT = Symbol('ATTENDANCE_HEALTH_CLIENT');
export const IDENTITY_HEALTH_CLIENT = Symbol('IDENTITY_HEALTH_CLIENT');

export function createHealthClientOptions({
  address,
  serverName,
  pkiDir,
  service,
}: {
  address: string;
  serverName: string;
  pkiDir: string;
  service: 'identity' | 'attendance';
}): GrpcOptions {
  let servicePackage = 'dexa.attendance.v1';
  let serviceProto = ATTENDANCE_PROTO_PATH;
  if (service === 'identity') {
    servicePackage = 'dexa.identity.v1';
    serviceProto = IDENTITY_PROTO_PATH;
  }

  return {
    transport: Transport.GRPC,
    options: {
      channelOptions: {
        'grpc.default_authority': serverName,
        'grpc.ssl_target_name_override': serverName,
      },
      credentials: ChannelCredentials.createSsl(
        readFileSync(join(pkiDir, 'ca.crt')),
        readFileSync(join(pkiDir, 'gateway.key')),
        readFileSync(join(pkiDir, 'gateway.crt')),
      ),
      package: ['grpc.health.v1', servicePackage],
      protoPath: [HEALTH_PROTO_PATH, serviceProto],
      url: address,
    },
  };
}
