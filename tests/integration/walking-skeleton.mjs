import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { baseUrl } from './auth-http.mjs';

const response = await fetch(`${baseUrl}/health/ready`);
assert.equal(
  response.status,
  200,
  'Gateway must reach both services over mutual TLS',
);

const redis = execFileSync(
  'docker',
  [
    'compose',
    'exec',
    '-T',
    'redis',
    'redis-cli',
    '--user',
    'identity',
    '-a',
    process.env.REDIS_PASSWORD ?? 'DexaRedis1!',
    'ping',
  ],
  { encoding: 'utf8' },
);
assert.match(redis, /PONG/);

const oracle = execFileSync(
  'docker',
  [
    'compose',
    'exec',
    '-T',
    'oracle',
    'sqlplus',
    '-s',
    `system/${process.env.ORACLE_PASSWORD ?? 'DexaOracle1!'}@//localhost:1521/FREEPDB1`,
  ],
  {
    encoding: 'utf8',
    input: 'SET HEADING OFF FEEDBACK OFF\nSELECT 1 FROM dual;\nEXIT\n',
  },
);
assert.match(oracle, /1/);

console.log('Walking skeleton integration check passed.');
