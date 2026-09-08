import { hash } from 'argon2';
import oracledb from 'oracledb';

const accounts = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    employeeNumber: 'DEX-001',
    fullName: 'Dexa HRD Administrator',
    phoneNumber: '+6280000000001',
    password: process.env.DEMO_HRD_PASSWORD,
    roles: ['EMPLOYEE', 'HRD'],
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    employeeNumber: 'DEX-002',
    fullName: 'Dexa Employee',
    phoneNumber: '+6280000000002',
    password: process.env.DEMO_EMPLOYEE_PASSWORD,
    roles: ['EMPLOYEE'],
  },
];

if (accounts.some((account) => !account.password))
  throw new Error('Demo account passwords are required');

const connection = await oracledb.getConnection({
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECT_STRING,
});

try {
  for (const account of accounts) {
    const existing = await connection.execute<{ ID: string }>(
      'SELECT id FROM employees WHERE id = :id',
      { id: account.id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (existing.rows?.length) continue;

    if (!account.password)
      throw new Error('Demo account passwords are required');
    const passwordHash = await hash(account.password, {
      type: 2,
      memoryCost: Number(process.env.ARGON2_MEMORY_COST ?? 19_456),
      timeCost: Number(process.env.ARGON2_TIME_COST ?? 2),
      parallelism: Number(process.env.ARGON2_PARALLELISM ?? 1),
    });
    await connection.execute(
      `INSERT INTO employees (id, employee_number, full_name, phone_number, password_hash)
       VALUES (:id, :employeeNumber, :fullName, :phoneNumber, :passwordHash)`,
      {
        id: account.id,
        employeeNumber: account.employeeNumber,
        fullName: account.fullName,
        phoneNumber: account.phoneNumber,
        passwordHash,
      },
    );
    for (const role of account.roles) {
      await connection.execute(
        'INSERT INTO employee_roles (employee_id, role) VALUES (:employeeId, :role)',
        { employeeId: account.id, role },
      );
    }
  }
  await connection.commit();
} finally {
  await connection.close();
}
