#!/bin/sh
set -eu

COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-.env.demo}"

compose() {
  docker compose --env-file "$COMPOSE_ENV_FILE" "$@"
}

run_node() {
  node --env-file="$COMPOSE_ENV_FILE" "$@"
}

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
    compose ps --all || true
    compose logs --no-color --tail 100 || true
  fi
  compose down --volumes --remove-orphans --timeout 10
  prune_integration_images
}
trap cleanup EXIT INT TERM

# A killed test run can bypass the trap. Remove it before allocating another stack.
compose down --volumes --remove-orphans --timeout 10
prune_integration_images
compose build identity attendance gateway
compose up --detach --wait --wait-timeout 180 gateway
compose exec -T gateway sh -c 'cat > /tmp/request-internal-token.mjs' < tests/integration/request-internal-token.mjs
compose exec -T attendance sh -c 'cat > /tmp/request-internal-token.mjs' < tests/integration/request-internal-token.mjs
run_node tests/integration/walking-skeleton.mjs
run_node tests/integration/authentication.mjs
run_node tests/integration/employee-administration.mjs
run_node tests/integration/attendance-zone.mjs
run_node tests/integration/evidence.mjs
compose exec -T redis sh -c 'redis-cli --user gateway -a "$RATE_LIMIT_REDIS_PASSWORD" --no-auth-warning --scan --pattern "rate:*" | while read -r key; do redis-cli --user gateway -a "$RATE_LIMIT_REDIS_PASSWORD" --no-auth-warning del "$key" >/dev/null; done'
run_node tests/integration/attendance-submissions.mjs
run_node tests/integration/session-lifecycle.mjs
