#!/bin/sh
set -eu

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dexa-integration-$$}"
GATEWAY_PORT="${GATEWAY_PORT:-$((20000 + $$ % 19000))}"
MINIO_PORT="${MINIO_PORT:-$((GATEWAY_PORT + 1))}"
APP_ORIGIN="http://localhost:${GATEWAY_PORT}"
export APP_ORIGIN COMPOSE_PROJECT_NAME GATEWAY_PORT MINIO_PORT

cleanup() {
  docker compose down --volumes --remove-orphans
}
trap cleanup EXIT INT TERM

docker compose up --build --detach --wait
node tests/integration/walking-skeleton.mjs
node tests/integration/authentication.mjs
node tests/integration/employee-administration.mjs
node tests/integration/attendance-zone.mjs
node tests/integration/evidence.mjs
node tests/integration/session-lifecycle.mjs
