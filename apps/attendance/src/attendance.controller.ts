import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// oxlint-disable max-params -- Nest supplies RPC handler dependencies separately.
import { status, Metadata } from '@grpc/grpc-js';
import { Controller } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import {
  type AttendanceZone,
  type AuthorizeEvidenceAccessRequest,
  type AuthorizeEvidenceUploadRequest,
  ClockType,
  type CreateManualAttendanceRequest,
  type CreateRegularAttendanceRequest,
  type UpdateAttendanceZoneRequest,
} from '@project/contracts';
import { z } from 'zod';

import { AttendanceZoneRepository } from './attendance-zone.js';
import type { Environment } from './config.schema.js';
import { EvidenceError, EvidenceService } from './evidence.service.js';
import { verifyInternalAccess } from './internal-token.js';
import {
  ManualAttendanceError,
  ManualAttendanceService,
} from './manual-attendance.service.js';
import {
  RegularAttendanceError,
  RegularAttendanceService,
} from './regular-attendance.service.js';

const regularSchema = z.object({
  clockType: z.union([
    z.literal(ClockType.CLOCK_TYPE_CLOCK_IN),
    z.literal(ClockType.CLOCK_TYPE_CLOCK_OUT),
  ]),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().finite(),
  evidenceUploadId: z.uuid(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(50).max(5000),
  active: z.boolean(),
});

function bearer(metadata: Metadata) {
  const value = metadata.get('authorization')[0];
  return typeof value === 'string' && value.startsWith('Bearer ')
    ? value.slice(7)
    : '';
}

function failure(code: number, detail: string, retryAfter?: number): never {
  const metadata = new Metadata();
  metadata.set('x-error-code', detail);
  if (retryAfter !== undefined) metadata.set('retry-after', String(retryAfter));
  throw new RpcException({ code, details: detail, metadata });
}

function grpcTimestamp(date: Date) {
  const milliseconds = date.getTime();
  return {
    seconds: Math.floor(milliseconds / 1_000),
    nanos: (milliseconds % 1_000) * 1_000_000,
  };
}

function protoDate(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value !== 'object' || value === null) return undefined;
  const seconds: unknown = Reflect.get(value, 'seconds');
  const nanos: unknown = Reflect.get(value, 'nanos');
  const numericSeconds =
    typeof seconds === 'object' && seconds !== null
      ? Number(Reflect.get(seconds, 'low')) +
        Number(Reflect.get(seconds, 'high')) * 0x1_0000_0000
      : Number(seconds);
  if (!Number.isFinite(numericSeconds) || !Number.isFinite(Number(nanos ?? 0)))
    return undefined;
  return new Date(numericSeconds * 1_000 + Number(nanos ?? 0) / 1_000_000);
}

const manualSchema = z.object({
  clockType: z.union([
    z.literal(ClockType.CLOCK_TYPE_CLOCK_IN),
    z.literal(ClockType.CLOCK_TYPE_CLOCK_OUT),
  ]),
  workDate: z.iso.date(),
  claimedAt: z.unknown().transform(protoDate),
  address: z.string().trim().min(1).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  reason: z.string().trim().min(1).max(1000),
  evidenceUploadId: z.string().uuid(),
});

function evidenceFailure(error: unknown): never {
  if (!(error instanceof EvidenceError)) throw error;
  const code =
    error.code === 'EVIDENCE_NOT_FOUND'
      ? status.NOT_FOUND
      : error.code === 'EVIDENCE_ALREADY_ATTACHED'
        ? status.ALREADY_EXISTS
        : error.code === 'EVIDENCE_FINALIZATION_FAILED'
          ? status.UNAVAILABLE
          : status.FAILED_PRECONDITION;
  failure(code, error.code);
}

function regularFailure(error: unknown): never {
  const code = error instanceof Error ? error.message : '';
  switch (code) {
    case 'EVIDENCE_NOT_FOUND':
      failure(status.NOT_FOUND, code);
    case 'ATTENDANCE_ALREADY_EXISTS':
    case 'IDEMPOTENCY_KEY_REUSED':
    case 'REQUEST_IN_PROGRESS':
      failure(status.ALREADY_EXISTS, code);
    case 'DEPENDENCY_UNAVAILABLE':
    case 'EVIDENCE_FINALIZATION_FAILED':
      failure(status.UNAVAILABLE, code);
    default:
      if (
        error instanceof RegularAttendanceError ||
        error instanceof EvidenceError
      )
        failure(status.FAILED_PRECONDITION, code);
      throw error;
  }
}

@Controller()
export class AttendanceController {
  private readonly issuer: string;
  private readonly publicKey: string;

  // Nest supplies these application dependencies.
  // oxlint-disable-next-line max-params
  constructor(
    private readonly zones: AttendanceZoneRepository,
    private readonly evidence: EvidenceService,
    private readonly regularAttendance: RegularAttendanceService,
    private readonly manualAttendance: ManualAttendanceService,
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
      return {
        ...result,
        expiresAt: grpcTimestamp(result.expiresAt),
      };
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
      return {
        ...result,
        expiresAt: grpcTimestamp(result.expiresAt),
      };
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
      if (!parsed.success) failure(status.INVALID_ARGUMENT, 'VALIDATION_ERROR');
      const key = metadata.get('idempotency-key')[0];
      if (typeof key !== 'string' || key.length < 1 || key.length > 128)
        failure(status.INVALID_ARGUMENT, 'IDEMPOTENCY_KEY_REQUIRED');
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
    if (typeof key !== 'string' || key.length < 1 || key.length > 128)
      failure(status.INVALID_ARGUMENT, 'IDEMPOTENCY_KEY_REQUIRED');
    const parsed = manualSchema.safeParse(request);
    if (!parsed.success) failure(status.INVALID_ARGUMENT, 'VALIDATION_ERROR');
    const data = parsed.data;
    if (!data.claimedAt) failure(status.INVALID_ARGUMENT, 'VALIDATION_ERROR');
    try {
      const result = await this.manualAttendance.create(claims.sub, key, {
        ...data,
        claimedAt: data.claimedAt,
      });
      if (!result.entry.claimedAt || !result.entry.submittedAt)
        throw new Error('manual attendance timestamps missing');
      return {
        ...result.entry,
        claimedAt: grpcTimestamp(result.entry.claimedAt),
        submittedAt: grpcTimestamp(result.entry.submittedAt),
        idempotentReplay: result.replay,
      };
    } catch (error) {
      if (error instanceof EvidenceError) evidenceFailure(error);
      if (!(error instanceof ManualAttendanceError)) throw error;
      if (error.code === 'REQUEST_IN_PROGRESS')
        failure(status.ABORTED, error.code, 1);
      if (
        error.code === 'IDEMPOTENCY_KEY_REUSED' ||
        error.code === 'ATTENDANCE_ALREADY_EXISTS'
      )
        failure(status.ALREADY_EXISTS, error.code);
      if (error.code === 'VALIDATION_ERROR')
        failure(status.INVALID_ARGUMENT, error.code);
      failure(status.FAILED_PRECONDITION, error.code);
    }
  }

  @GrpcMethod('AttendanceService', 'UpdateAttendanceZone')
  async updateAttendanceZone(
    request: UpdateAttendanceZoneRequest,
    metadata: Metadata,
  ): Promise<AttendanceZone> {
    const claims = await this.authorize(metadata, ['HRD']);
    const parsed = updateSchema.safeParse(request);
    if (!parsed.success) failure(status.INVALID_ARGUMENT, 'VALIDATION_ERROR');
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
