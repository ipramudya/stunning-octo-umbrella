import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// oxlint-disable max-params -- Nest supplies RPC handler dependencies separately.
import { status, Metadata } from '@grpc/grpc-js';
import { Controller } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GrpcMethod } from '@nestjs/microservices';
import {
  type AttendanceZone,
  type AuthorizeEvidenceAccessRequest,
  type AuthorizeEvidenceUploadRequest,
  ClockType,
  type CreateManualAttendanceRequest,
  type CreateRegularAttendanceRequest,
  type DecideManualAttendanceRequest,
  type GetAttendanceRequest,
  type GetManualAttendanceRequest,
  type ListAttendanceRequest,
  type ListAttendanceResponse,
  type ListEmployeeAttendanceRequest,
  type ListPendingManualAttendanceRequest,
  type UpdateAttendanceZoneRequest,
} from '@project/contracts';

import { AttendanceQueryService } from '../attendance-query/attendance-query.service.js';
import { AttendanceZoneRepository } from '../attendance-zone/attendance-zone.repository.js';
import { verifyInternalAccess } from '../auth/internal-token.js';
import type { Environment } from '../config/config-typedef.js';
import { EvidenceError } from '../evidence/evidence.service.js';
import { EvidenceService } from '../evidence/evidence.service.js';
import { ManualAttendanceError } from '../manual-attendance/manual-attendance.helper.js';
import { ManualAttendanceService } from '../manual-attendance/manual-attendance.service.js';
import { ManualDecisionService } from '../manual-decision/manual-decision.service.js';
import { RegularAttendanceService } from '../regular-attendance/regular-attendance.service.js';
import {
  evidenceFailure,
  failure,
  manualDecisionFailure,
  queryFailure,
  regularFailure,
} from './attendance.error.js';
import { bearer, grpcEntry, grpcTimestamp } from './attendance.helper.js';
import {
  manualSchema,
  regularSchema,
  updateSchema,
} from './attendance.schema.js';

@Controller()
export class AttendanceController {
  private readonly issuer: string;
  private readonly publicKey: string;

  constructor(
    private readonly zones: AttendanceZoneRepository,
    private readonly evidence: EvidenceService,
    private readonly regularAttendance: RegularAttendanceService,
    private readonly manualAttendance: ManualAttendanceService,
    private readonly manualDecisions: ManualDecisionService,
    private readonly queries: AttendanceQueryService,
    config: ConfigService<Environment, true>,
  ) {
    this.issuer = config.get('JWT_ISSUER', { infer: true });
    this.publicKey = readFileSync(
      join(config.get('PKI_DIR', { infer: true }), 'identity-signing.pub'),
      'utf8',
    );
  }

  @GrpcMethod('AttendanceService', 'GetAttendanceZone')
  async getAttendanceZone(
    _request: object,
    metadata: Metadata,
  ): Promise<AttendanceZone> {
    await this.authorize(metadata);
    return this.zones.get();
  }

  @GrpcMethod('AttendanceService', 'ListEmployeeAttendance')
  async listEmployeeAttendance(
    request: ListEmployeeAttendanceRequest,
    metadata: Metadata,
  ): Promise<ListAttendanceResponse> {
    try {
      const claims = await this.authorize(metadata, ['EMPLOYEE']);
      const items = await this.queries.listEmployee(claims.sub, request.month);
      return { items: items.map(grpcEntry), hasNextPage: false };
    } catch (error) {
      queryFailure(error);
    }
  }

  @GrpcMethod('AttendanceService', 'GetEmployeeAttendance')
  async getEmployeeAttendance(
    request: GetAttendanceRequest,
    metadata: Metadata,
  ) {
    try {
      const claims = await this.authorize(metadata, ['EMPLOYEE']);
      return grpcEntry(
        await this.queries.getEmployee(claims.sub, request.entryId),
      );
    } catch (error) {
      queryFailure(error);
    }
  }

  @GrpcMethod('AttendanceService', 'ListAttendance')
  async listAttendance(request: ListAttendanceRequest, metadata: Metadata) {
    try {
      await this.authorize(metadata, ['HRD']);
      const result = await this.queries.list(request);
      return { ...result, items: result.items.map(grpcEntry) };
    } catch (error) {
      queryFailure(error);
    }
  }

  @GrpcMethod('AttendanceService', 'GetAttendance')
  async getAttendance(request: GetAttendanceRequest, metadata: Metadata) {
    try {
      await this.authorize(metadata, ['HRD']);
      return grpcEntry(await this.queries.get(request.entryId));
    } catch (error) {
      queryFailure(error);
    }
  }

  @GrpcMethod('AttendanceService', 'AuthorizeEvidenceUpload')
  async authorizeEvidenceUpload(
    request: AuthorizeEvidenceUploadRequest,
    metadata: Metadata,
  ) {
    try {
      const claims = await this.authorize(metadata);
      const result = await this.evidence.authorizeUpload(
        { employeeId: claims.sub, roles: claims.roles },
        request.contentType,
        request.sizeBytes,
      );
      return { ...result, expiresAt: grpcTimestamp(result.expiresAt) };
    } catch (error) {
      evidenceFailure(error);
    }
  }

  @GrpcMethod('AttendanceService', 'AuthorizeEvidenceAccess')
  async authorizeEvidenceAccess(
    request: AuthorizeEvidenceAccessRequest,
    metadata: Metadata,
  ) {
    try {
      const claims = await this.authorize(metadata);
      const result = await this.evidence.authorizeAccess(
        { employeeId: claims.sub, roles: claims.roles },
        request.evidenceId,
      );
      return { ...result, expiresAt: grpcTimestamp(result.expiresAt) };
    } catch (error) {
      evidenceFailure(error);
    }
  }

  @GrpcMethod('AttendanceService', 'CreateRegularAttendance')
  async createRegularAttendance(
    request: CreateRegularAttendanceRequest,
    metadata: Metadata,
  ) {
    try {
      const claims = await this.authorize(metadata, ['EMPLOYEE']);
      const parsed = regularSchema.safeParse(request);
      if (!parsed.success) {
        failure(status.INVALID_ARGUMENT, 'VALIDATION_ERROR');
      }
      const key = metadata.get('idempotency-key')[0];
      if (typeof key !== 'string' || key.length < 1 || key.length > 128) {
        failure(status.INVALID_ARGUMENT, 'IDEMPOTENCY_KEY_REQUIRED');
      }
      const result = await this.regularAttendance.create(claims.sub, key, {
        ...parsed.data,
        clockType:
          parsed.data.clockType === ClockType.CLOCK_TYPE_CLOCK_IN
            ? 'CLOCK_IN'
            : 'CLOCK_OUT',
      });
      return {
        ...result.entry,
        clockType:
          result.entry.clockType === 'CLOCK_IN'
            ? ClockType.CLOCK_TYPE_CLOCK_IN
            : ClockType.CLOCK_TYPE_CLOCK_OUT,
        occurredAt: grpcTimestamp(new Date(result.entry.occurredAt)),
        submittedAt: grpcTimestamp(new Date(result.entry.submittedAt)),
        idempotentReplay: result.replayed,
      };
    } catch (error) {
      regularFailure(error);
    }
  }

  @GrpcMethod('AttendanceService', 'CreateManualAttendance')
  async createManualAttendance(
    request: CreateManualAttendanceRequest,
    metadata: Metadata,
  ) {
    const claims = await this.authorize(metadata, ['EMPLOYEE']);
    const key = metadata.get('idempotency-key')[0];
    if (typeof key !== 'string' || key.length < 1 || key.length > 128) {
      failure(status.INVALID_ARGUMENT, 'IDEMPOTENCY_KEY_REQUIRED');
    }
    const parsed = manualSchema.safeParse(request);
    if (!parsed.success) {
      failure(status.INVALID_ARGUMENT, 'VALIDATION_ERROR');
    }
    try {
      const result = await this.manualAttendance.create(
        claims.sub,
        key,
        parsed.data,
      );
      if (!result.entry.claimedAt || !result.entry.submittedAt) {
        throw new Error('manual attendance timestamps missing');
      }
      return {
        ...result.entry,
        claimedAt: grpcTimestamp(result.entry.claimedAt),
        submittedAt: grpcTimestamp(result.entry.submittedAt),
        idempotentReplay: result.replay,
      };
    } catch (error) {
      if (error instanceof EvidenceError) {
        evidenceFailure(error);
      }
      if (!(error instanceof ManualAttendanceError)) {
        throw error;
      }
      switch (error.code) {
        case 'REQUEST_IN_PROGRESS':
          failure(status.ABORTED, error.code, 1);
        case 'IDEMPOTENCY_KEY_REUSED':
        case 'ATTENDANCE_ALREADY_EXISTS':
          failure(status.ALREADY_EXISTS, error.code);
        case 'VALIDATION_ERROR':
          failure(status.INVALID_ARGUMENT, error.code);
        default:
          failure(status.FAILED_PRECONDITION, error.code);
      }
    }
  }

  @GrpcMethod('AttendanceService', 'ListPendingManualAttendance')
  async listPendingManualAttendance(
    request: ListPendingManualAttendanceRequest,
    metadata: Metadata,
  ) {
    await this.authorize(metadata, ['HRD']);
    try {
      const result = await this.manualDecisions.list(
        request.cursor,
        request.limit,
      );
      return { ...result, items: result.items.map(grpcEntry) };
    } catch (error) {
      manualDecisionFailure(error);
    }
  }

  @GrpcMethod('AttendanceService', 'GetManualAttendance')
  async getManualAttendance(
    request: GetManualAttendanceRequest,
    metadata: Metadata,
  ) {
    await this.authorize(metadata, ['HRD']);
    try {
      return grpcEntry(await this.manualDecisions.get(request.entryId));
    } catch (error) {
      manualDecisionFailure(error);
    }
  }

  @GrpcMethod('AttendanceService', 'DecideManualAttendance')
  async decideManualAttendance(
    request: DecideManualAttendanceRequest,
    metadata: Metadata,
  ) {
    const claims = await this.authorize(metadata, ['HRD']);
    const key = metadata.get('idempotency-key')[0];
    if (typeof key !== 'string' || key.length < 1 || key.length > 128) {
      failure(status.INVALID_ARGUMENT, 'IDEMPOTENCY_KEY_REQUIRED');
    }
    try {
      const result = await this.manualDecisions.decide(
        claims.sub,
        key,
        request,
      );
      return grpcEntry({ ...result.entry, idempotentReplay: result.replay });
    } catch (error) {
      manualDecisionFailure(error);
    }
  }

  @GrpcMethod('AttendanceService', 'UpdateAttendanceZone')
  async updateAttendanceZone(
    request: UpdateAttendanceZoneRequest,
    metadata: Metadata,
  ): Promise<AttendanceZone> {
    const claims = await this.authorize(metadata, ['HRD']);
    const parsed = updateSchema.safeParse(request);
    if (!parsed.success) {
      failure(status.INVALID_ARGUMENT, 'VALIDATION_ERROR');
    }
    return this.zones.update(parsed.data, claims.sub);
  }

  private async authorize(
    metadata: Metadata,
    roles: ('EMPLOYEE' | 'HRD')[] = [],
  ) {
    try {
      return await verifyInternalAccess({
        token: bearer(metadata),
        publicKeyPem: this.publicKey,
        issuer: this.issuer,
        requiredRoles: roles,
      });
    } catch (error) {
      failure(
        error instanceof Error && error.message === 'forbidden'
          ? status.PERMISSION_DENIED
          : status.UNAUTHENTICATED,
        error instanceof Error && error.message === 'forbidden'
          ? 'FORBIDDEN'
          : 'AUTHENTICATION_REQUIRED',
      );
    }
  }
}
