import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import oracledb from 'oracledb';

const directory = resolve(process.cwd(), process.argv[2]);
const connection = await oracledb.getConnection({
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECT_STRING,
});

try {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const [version] = file.split('_', 1);
    const sql = await readFile(resolve(directory, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    let existing;
    try {
      const result = await connection.execute(
        'SELECT checksum FROM schema_migrations WHERE version = :version',
        { version },
      );
      existing = result.rows?.[0]?.[0];
    } catch (error) {
      if (version !== '001' || error.errorNum !== 942) {
        throw error;
      }
    }
    if (existing && existing !== checksum) {
      throw new Error(`Migration checksum mismatch: ${file}`);
    }
    if (existing) {
      continue;
    }
    await connection.execute(sql.trim());
    await connection.execute(
      'INSERT INTO schema_migrations (version, name, checksum) VALUES (:version, :name, :checksum)',
      { version, name: file, checksum },
      { autoCommit: true },
    );
  }
} finally {
  await connection.close();
}
