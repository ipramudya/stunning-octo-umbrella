import oracledb from 'oracledb';

const connection = await oracledb.getConnection({
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECT_STRING,
});

try {
  await connection.execute(
    `INSERT INTO attendance_zones
       (id, name, address, latitude, longitude, center, radius_meters, active)
     SELECT 1, :name, :address, :latitude, :longitude,
       MDSYS.SDO_GEOMETRY(2001, 4326, MDSYS.SDO_POINT_TYPE(:longitude, :latitude, NULL), NULL, NULL),
       :radiusMeters, 1
     FROM dual WHERE NOT EXISTS (SELECT 1 FROM attendance_zones WHERE id = 1)`,
    {
      name: 'Titan Center',
      address: 'Titan Center, Bintaro',
      latitude: -6.2806863,
      longitude: 106.7264211,
      radiusMeters: 500,
    },
  );
  await connection.commit();
} catch (error) {
  await connection.rollback();

  throw error;
} finally {
  await connection.close();
}
