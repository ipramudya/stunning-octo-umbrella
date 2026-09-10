#!/bin/sh
set -eu

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dexa-integration}"
GATEWAY_PORT="${GATEWAY_PORT:-$((20000 + $$ % 19000))}"
MINIO_PORT="${MINIO_PORT:-$((GATEWAY_PORT + 1))}"
APP_ORIGIN="http://localhost:${GATEWAY_PORT}"
export APP_ORIGIN COMPOSE_PROJECT_NAME GATEWAY_PORT MINIO_PORT

prune_integration_images() {
  docker image prune --force \
    --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" >/dev/null || true
}

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    docker compose ps --all || true
    docker compose logs --no-color --tail 100 || true
  fi
  docker compose down --volumes --remove-orphans --timeout 10
  prune_integration_images
}
trap cleanup EXIT INT TERM

# A killed test run can bypass the trap. Remove it before allocating another stack.
docker compose down --volumes --remove-orphans --timeout 10
prune_integration_images
docker compose build identity attendance gateway
docker compose up --detach --wait --wait-timeout 180 gateway
node tests/integration/walking-skeleton.mjs
node tests/integration/authentication.mjs
node tests/integration/employee-administration.mjs
node tests/integration/attendance-zone.mjs
node tests/integration/evidence.mjs
docker compose exec -T redis sh -c 'redis-cli --user gateway -a "$RATE_LIMIT_REDIS_PASSWORD" --no-auth-warning --scan --pattern "rate:*" | while read -r key; do redis-cli --user gateway -a "$RATE_LIMIT_REDIS_PASSWORD" --no-auth-warning del "$key" >/dev/null; done'
node tests/integration/attendance-submissions.mjs
node tests/integration/session-lifecycle.mjs
