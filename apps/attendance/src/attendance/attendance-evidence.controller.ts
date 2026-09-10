import type { Metadata } from '@grpc/grpc-js';
import { Controller, UseFilters, UseGuards } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  AuthorizeEvidenceAccessRequest,
  AuthorizeEvidenceUploadRequest,
} from '@project/contracts';

import { GrpcAuthGuard } from '../auth/grpc-auth.guard.js';
import { GrpcAuthorizationService } from '../auth/grpc-authorization.service.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { EvidenceService } from '../evidence/evidence.service.js';
import { AttendanceExceptionFilter } from './attendance-exception.filter.js';
import { grpcTimestamp } from './attendance.helper.js';

@Controller()
@UseFilters(AttendanceExceptionFilter)
@UseGuards(GrpcAuthGuard, RolesGuard)
export class AttendanceEvidenceController {
  constructor(
    private readonly authorization: GrpcAuthorizationService,
    private readonly evidence: EvidenceService,
  ) {}

  @GrpcMethod('AttendanceService', 'AuthorizeEvidenceUpload')
  async authorizeEvidenceUpload(
    request: AuthorizeEvidenceUploadRequest,
    metadata: Metadata,
  ) {
    const claims = this.authorization.claims(metadata);

    const result = await this.evidence.authorizeUpload(
      { employeeId: claims.sub, roles: claims.roles },
      request.contentType,
      request.sizeBytes,
    );

    return { ...result, expiresAt: grpcTimestamp(result.expiresAt) };
  }

  @GrpcMethod('AttendanceService', 'AuthorizeEvidenceAccess')
  async authorizeEvidenceAccess(
    request: AuthorizeEvidenceAccessRequest,
    metadata: Metadata,
  ) {
    const claims = this.authorization.claims(metadata);

    const result = await this.evidence.authorizeAccess(
      { employeeId: claims.sub, roles: claims.roles },
      request.evidenceId,
    );

    return { ...result, expiresAt: grpcTimestamp(result.expiresAt) };
  }
}
