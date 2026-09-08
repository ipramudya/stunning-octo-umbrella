import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const response = await fetch(
  `${(process.env.APP_ORIGIN ?? "http://localhost:3000").replace("localhost", "127.0.0.1")}/health/ready`,
);
assert.equal(response.status, 200, "Gateway must reach both services over mutual TLS");

const redis = execFileSync(
  "docker",
  [
    "compose",
    "exec",
    "-T",
    "redis",
    "redis-cli",
    "--user",
    "identity",
    "-a",
    process.env.REDIS_PASSWORD ?? "DexaRedis1!",
    "ping",
  ],
  { encoding: "utf8" },
);
assert.match(redis, /PONG/);

const oracle = execFileSync(
  "docker",
  [
    "compose",
    "exec",
    "-T",
    "oracle",
    "sqlplus",
    "-s",
    `system/${process.env.ORACLE_PASSWORD ?? "DexaOracle1!"}@//localhost:1521/FREEPDB1`,
  ],
  {
    encoding: "utf8",
    input: "SET HEADING OFF FEEDBACK OFF\nSELECT 1 FROM dual;\nEXIT\n",
  },
);
assert.match(oracle, /1/);

console.log("Walking skeleton integration check passed.");
