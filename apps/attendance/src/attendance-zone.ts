import type { UpdateAttendanceZoneRequest } from "@project/contracts";
import { Injectable } from "@nestjs/common";
import oracledb, { type Connection } from "oracledb";
import { OracleDatabase } from "./oracle.js";

export class AttendanceConflict extends Error {}

type ZoneRow = {
  NAME: string;
  ADDRESS: string;
  LATITUDE: number;
  LONGITUDE: number;
  RADIUS_METERS: number;
  ACTIVE: number;
};

@Injectable()
export class AttendanceZoneRepository {
  constructor(private readonly database: OracleDatabase) {}

  get() {
    return this.database.withConnection((connection) => this.select(connection));
  }

  update(value: UpdateAttendanceZoneRequest, employeeId: string) {
    return this.database.withTransaction(async (connection) => {
      await connection.execute("SELECT id FROM attendance_zones WHERE id = 1 FOR UPDATE");
      await connection.execute(
        `UPDATE attendance_zones SET name = :name, address = :address,
           latitude = :latitude, longitude = :longitude,
           center = MDSYS.SDO_GEOMETRY(2001, 4326,
             MDSYS.SDO_POINT_TYPE(:longitude, :latitude, NULL), NULL, NULL),
           radius_meters = :radiusMeters, active = :active,
           updated_at = SYSTIMESTAMP, updated_by_employee_id = :employeeId
         WHERE id = 1`,
        {
          name: { val: value.name, type: oracledb.STRING, maxSize: 120 },
          address: { val: value.address, type: oracledb.STRING, maxSize: 500 },
          latitude: { val: value.latitude, type: oracledb.NUMBER },
          longitude: { val: value.longitude, type: oracledb.NUMBER },
          radiusMeters: { val: value.radiusMeters, type: oracledb.NUMBER },
          active: { val: value.active ? 1 : 0, type: oracledb.NUMBER },
          employeeId: { val: employeeId, type: oracledb.STRING, maxSize: 36 },
        },
      );
      return this.select(connection);
    });
  }

  async withAttendanceMutation<T>(
    employeeId: string,
    workDate: Date,
    work: (connection: Connection) => Promise<T>,
  ) {
    try {
      return await this.database.withTransaction(async (connection) => {
        await connection.execute("SELECT id FROM attendance_zones WHERE id = 1 FOR UPDATE");
        await connection.execute(
          `SELECT id FROM attendance_entries
           WHERE employee_id = :employeeId AND work_date = :workDate
           ORDER BY CASE clock_type WHEN 'CLOCK_IN' THEN 1 ELSE 2 END
           FOR UPDATE`,
          {
            employeeId: { val: employeeId, type: oracledb.STRING, maxSize: 36 },
            workDate: { val: workDate, type: oracledb.DATE },
          },
        );
        return work(connection);
      });
    } catch (error) {
      if ((error as { errorNum?: number }).errorNum === 1)
        throw new AttendanceConflict("attendance action already exists");
      throw error;
    }
  }

  private async select(connection: Connection) {
    const result = await connection.execute<ZoneRow>(
      `SELECT name, address, latitude, longitude, radius_meters, active
       FROM attendance_zones WHERE id = 1`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const row = result.rows?.[0];
    if (!row) throw new Error("attendance zone is missing");
    return {
      name: row.NAME,
      address: row.ADDRESS,
      latitude: row.LATITUDE,
      longitude: row.LONGITUDE,
      radiusMeters: row.RADIUS_METERS,
      active: row.ACTIVE === 1,
    };
  }
}
