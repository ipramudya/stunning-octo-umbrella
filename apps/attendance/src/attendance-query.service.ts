import { status } from '@grpc/grpc-js';
import { Injectable } from '@nestjs/common';
import {
  AttendanceOrder,
  AttendanceSource,
  AttendanceStatus,
  ClockType,
  type AttendanceEntry,
  type ListAttendanceRequest,
} from '@project/contracts';
import { z } from 'zod';

import {
  AttendanceQueryRepository,
  type AttendanceCursor,
} from './attendance-query.repository.js';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const monthPattern = /^\d{4}-\d{2}$/;
const cursorSchema = z.object({
  workDate: z.string().regex(datePattern),
  submittedAt: z.iso.datetime(),
  id: z.string().min(1),
});

export class AttendanceQueryError extends Error {
  constructor(
    readonly code: string,
    readonly grpcStatus = status.INVALID_ARGUMENT,
  ) {
    super(code);
  }
}

function fail(code: string, grpcStatus = status.INVALID_ARGUMENT): never {
  throw new AttendanceQueryError(code, grpcStatus);
}

const source = new Map([
  [AttendanceSource.ATTENDANCE_SOURCE_REGULAR, 'REGULAR' as const],
  [AttendanceSource.ATTENDANCE_SOURCE_MANUAL, 'MANUAL' as const],
]);
const attendanceStatus = new Map([
  [
    AttendanceStatus.ATTENDANCE_STATUS_PENDING_REVIEW,
    'PENDING_REVIEW' as const,
  ],
  [AttendanceStatus.ATTENDANCE_STATUS_RECORDED, 'RECORDED' as const],
  [AttendanceStatus.ATTENDANCE_STATUS_REJECTED, 'REJECTED' as const],
]);
const clockType = new Map([
  [ClockType.CLOCK_TYPE_CLOCK_IN, 'CLOCK_IN' as const],
  [ClockType.CLOCK_TYPE_CLOCK_OUT, 'CLOCK_OUT' as const],
]);

function nextMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function decodeCursor(value?: string): AttendanceCursor | undefined {
  if (!value) return undefined;
  try {
    const cursor = cursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
    return { ...cursor, submittedAt: new Date(cursor.submittedAt) };
  } catch {
    fail('INVALID_CURSOR');
  }
}

function encodeCursor(entry: AttendanceEntry) {
  return Buffer.from(
    JSON.stringify({
      workDate: entry.workDate,
      submittedAt: entry.submittedAt,
      id: entry.id,
    }),
  ).toString('base64url');
}

@Injectable()
export class AttendanceQueryService {
  constructor(private readonly repository: AttendanceQueryRepository) {}

  async listEmployee(employeeId: string, month: string) {
    if (!monthPattern.test(month)) fail('VALIDATION_ERROR');
    return this.repository.listEmployee(
      employeeId,
      `${month}-01`,
      nextMonth(month),
    );
  }

  async getEmployee(employeeId: string, entryId: string) {
    const entry = await this.repository.get(entryId, employeeId);
    if (!entry) fail('ATTENDANCE_NOT_FOUND', status.NOT_FOUND);
    return entry;
  }

  async list(request: ListAttendanceRequest) {
    if (
      !datePattern.test(request.dateFrom) ||
      !datePattern.test(request.dateTo)
    )
      fail('VALIDATION_ERROR');
    const dateFrom = new Date(`${request.dateFrom}T00:00:00.000Z`);
    const dateTo = new Date(`${request.dateTo}T00:00:00.000Z`);
    const days = (dateTo.getTime() - dateFrom.getTime()) / 86_400_000;
    if (days < 0 || days > 30) fail('DATE_RANGE_TOO_LARGE');
    const limit = request.limit || 20;
    if (limit < 1 || limit > 100) fail('VALIDATION_ERROR');
    const selectedSource = request.source
      ? source.get(request.source)
      : undefined;
    const selectedStatus = request.status
      ? attendanceStatus.get(request.status)
      : undefined;
    const selectedClockType = request.clockType
      ? clockType.get(request.clockType)
      : undefined;
    if (
      (request.source && !selectedSource) ||
      (request.status && !selectedStatus) ||
      (request.clockType && !selectedClockType)
    )
      fail('VALIDATION_ERROR');
    const order =
      request.order === AttendanceOrder.ATTENDANCE_ORDER_ASC ? 'ASC' : 'DESC';
    const entries = await this.repository.list({
      dateFrom: request.dateFrom,
      dateTo: request.dateTo,
      employeeId: request.employeeId,
      source: selectedSource,
      status: selectedStatus,
      clockType: selectedClockType,
      order,
      cursor: decodeCursor(request.cursor),
      limit,
    });
    const hasNextPage = entries.length > limit;
    const items = entries.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: hasNextPage && last ? encodeCursor(last) : undefined,
      hasNextPage,
    };
  }

  async get(entryId: string) {
    const entry = await this.repository.get(entryId);
    if (!entry) fail('ATTENDANCE_NOT_FOUND', status.NOT_FOUND);
    return entry;
  }
}
