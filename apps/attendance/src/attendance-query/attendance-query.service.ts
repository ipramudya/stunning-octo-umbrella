import { status } from '@grpc/grpc-js';
import { Injectable } from '@nestjs/common';
import {
  AttendanceOrder,
  type AttendanceEntry,
  type ListAttendanceRequest,
} from '@project/contracts';
import { z } from 'zod';

import {
  attendanceSourceNames,
  attendanceStatusNames,
  clockTypeNames,
  datePattern,
  monthPattern,
} from './attendance-query.constant.js';
import type { AttendanceCursor } from './attendance-query.entity.js';
import { AttendanceQueryError } from './attendance-query.error.js';
import { AttendanceQueryRepository } from './attendance-query.repository.js';

const cursorSchema = z.object({
  workDate: z.string().regex(datePattern),
  submittedAt: z.iso.datetime(),
  id: z.string().min(1),
});
@Injectable()
export class AttendanceQueryService {
  private fail(code: string, grpcStatus = status.INVALID_ARGUMENT): never {
    throw new AttendanceQueryError(code, grpcStatus);
  }

  private nextMonth(month: string) {
    const date = new Date(`${month}-01T00:00:00.000Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return date.toISOString().slice(0, 10);
  }

  private decodeCursor(value?: string): AttendanceCursor | undefined {
    if (!value) {
      return undefined;
    }
    try {
      const cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
      );
      return { ...cursor, submittedAt: new Date(cursor.submittedAt) };
    } catch {
      this.fail('INVALID_CURSOR');
    }
  }

  private encodeCursor(entry: AttendanceEntry) {
    return Buffer.from(
      JSON.stringify({
        workDate: entry.workDate,
        submittedAt: entry.submittedAt,
        id: entry.id,
      }),
    ).toString('base64url');
  }

  constructor(private readonly repository: AttendanceQueryRepository) {}

  async listEmployee(employeeId: string, month: string) {
    if (!monthPattern.test(month)) {
      this.fail('VALIDATION_ERROR');
    }
    return this.repository.listEmployee(
      employeeId,
      `${month}-01`,
      this.nextMonth(month),
    );
  }

  async getEmployee(employeeId: string, entryId: string) {
    const entry = await this.repository.get(entryId, employeeId);
    if (!entry) {
      this.fail('ATTENDANCE_NOT_FOUND', status.NOT_FOUND);
    }
    return entry;
  }

  async list(request: ListAttendanceRequest) {
    if (
      !datePattern.test(request.dateFrom) ||
      !datePattern.test(request.dateTo)
    ) {
      this.fail('VALIDATION_ERROR');
    }
    const dateFrom = new Date(`${request.dateFrom}T00:00:00.000Z`);
    const dateTo = new Date(`${request.dateTo}T00:00:00.000Z`);
    const days = (dateTo.getTime() - dateFrom.getTime()) / 86_400_000;
    if (days < 0 || days > 30) {
      this.fail('DATE_RANGE_TOO_LARGE');
    }
    const limit = request.limit || 20;
    if (limit < 1 || limit > 100) {
      this.fail('VALIDATION_ERROR');
    }
    const selectedSource = request.source
      ? attendanceSourceNames.get(request.source)
      : undefined;
    const selectedStatus = request.status
      ? attendanceStatusNames.get(request.status)
      : undefined;
    const selectedClockType = request.clockType
      ? clockTypeNames.get(request.clockType)
      : undefined;
    const hasInvalidSource = request.source && !selectedSource;
    const hasInvalidStatus = request.status && !selectedStatus;
    const hasInvalidClockType = request.clockType && !selectedClockType;
    if (hasInvalidSource || hasInvalidStatus || hasInvalidClockType) {
      this.fail('VALIDATION_ERROR');
    }
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
      cursor: this.decodeCursor(request.cursor),
      limit,
    });
    const hasNextPage = entries.length > limit;
    const items = entries.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: hasNextPage && last ? this.encodeCursor(last) : undefined,
      hasNextPage,
    };
  }

  async get(entryId: string) {
    const entry = await this.repository.get(entryId);
    if (!entry) {
      this.fail('ATTENDANCE_NOT_FOUND', status.NOT_FOUND);
    }
    return entry;
  }
}
