import type { Metadata } from '@grpc/grpc-js';
import { Controller, UseFilters } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  AuthorizeEvidenceAccessRequest,
  AuthorizeEvidenceUploadRequest,
} from '@project/contracts';

import { EvidenceService } from '../evidence/evidence.service.js';
import { AttendanceAuthorizationService } from './attendance-authorization.service.js';
import { AttendanceExceptionFilter } from './attendance-exception.filter.js';
import { grpcTimestamp } from './attendance.helper.js';

@Controller()
@UseFilters(AttendanceExceptionFilter)
export class AttendanceEvidenceController {
  constructor(
    private readonly authorization: AttendanceAuthorizationService,
    private readonly evidence: EvidenceService,
  ) {}

  @GrpcMethod('AttendanceService', 'AuthorizeEvidenceUpload')
  async authorizeEvidenceUpload(
    request: AuthorizeEvidenceUploadRequest,
    metadata: Metadata,
  ) {
    const claims = await this.authorization.authorize(metadata);
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
    const claims = await this.authorization.authorize(metadata);
    const result = await this.evidence.authorizeAccess(
      { employeeId: claims.sub, roles: claims.roles },
      request.evidenceId,
    );
    return { ...result, expiresAt: grpcTimestamp(result.expiresAt) };
  }
}
