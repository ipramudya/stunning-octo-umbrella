import { Injectable } from '@nestjs/common';
import type { AttendanceEntry } from '@project/contracts';
import oracledb from 'oracledb';

import type { AttendanceEntryRow } from '../manual-decision/manual-decision.entity.js';
import {
  attendanceColumns,
  attendanceEntry,
} from '../manual-decision/manual-decision.repository.js';
import { OracleDatabase } from '../oracle.js';
import type { AttendanceFilters } from './attendance-query.entity.js';

const oracleDate = (value: string) => ({
  val: new Date(`${value}T00:00:00.000Z`),
  type: oracledb.DATE,
});

@Injectable()
export class AttendanceQueryRepository {
  constructor(private readonly database: OracleDatabase) {}

  async listEmployee(employeeId: string, dateFrom: string, dateTo: string) {
    return this.database.withConnection(async (connection) => {
      const result = await connection.execute<AttendanceEntryRow>(
        `SELECT ${attendanceColumns} FROM attendance_entries
         WHERE employee_id = :employeeId
           AND work_date >= :dateFrom AND work_date < :dateTo
         ORDER BY work_date, CASE clock_type WHEN 'CLOCK_IN' THEN 1 ELSE 2 END, id`,
        {
          employeeId,
          dateFrom: oracleDate(dateFrom),
          dateTo: oracleDate(dateTo),
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      return (result.rows ?? []).map(attendanceEntry);
    });
  }

  get(
    entryId: string,
    employeeId?: string,
  ): Promise<AttendanceEntry | undefined> {
    return this.database.withConnection(async (connection) => {
      let employeeClause = '';

      if (employeeId) {
        employeeClause = ' AND employee_id = :employeeId';
      }

      const binds: oracledb.BindParameters = { entryId };

      if (employeeId) {
        binds.employeeId = employeeId;
      }

      const result = await connection.execute<AttendanceEntryRow>(
        `SELECT ${attendanceColumns} FROM attendance_entries
         WHERE id = :entryId${employeeClause}`,
        binds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      const row = result.rows?.[0];

      if (row) {
        return attendanceEntry(row);
      }

      return undefined;
    });
  }

  async list(filters: AttendanceFilters) {
    const clauses = ['work_date >= :dateFrom', 'work_date <= :dateTo'];
    const binds: oracledb.BindParameters = {
      dateFrom: oracleDate(filters.dateFrom),
      dateTo: oracleDate(filters.dateTo),
    };

    for (const [column, value] of [
      ['employee_id', filters.employeeId],
      ['source', filters.source],
      ['status', filters.status],
      ['clock_type', filters.clockType],
    ] as const) {
      if (value) {
        clauses.push(`${column} = :${column}`);
        binds[column] = value;
      }
    }

    if (filters.cursor) {
      let operator = '<';

      if (filters.order === 'ASC') {
        operator = '>';
      }

      clauses.push(`(work_date ${operator} :cursorDate
        OR (work_date = :cursorDate AND submitted_at ${operator} :cursorAt)
        OR (work_date = :cursorDate AND submitted_at = :cursorAt AND id ${operator} :cursorId))`);
      binds.cursorDate = oracleDate(filters.cursor.workDate);
      binds.cursorAt = {
        val: filters.cursor.submittedAt,
        type: oracledb.DB_TYPE_TIMESTAMP_TZ,
      };
      binds.cursorId = filters.cursor.id;
    }

    return this.database.withConnection(async (connection) => {
      const result = await connection.execute<AttendanceEntryRow>(
        `SELECT ${attendanceColumns} FROM attendance_entries
         WHERE ${clauses.join(' AND ')}
         ORDER BY work_date ${filters.order}, submitted_at ${filters.order}, id ${filters.order}
         FETCH FIRST ${filters.limit + 1} ROWS ONLY`,
        binds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      return (result.rows ?? []).map(attendanceEntry);
    });
  }
}
