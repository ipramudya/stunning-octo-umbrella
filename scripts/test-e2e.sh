#!/bin/sh
set -eu

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dexa-e2e}"
GATEWAY_PORT="${GATEWAY_PORT:-$((21000 + $$ % 10000))}"
MINIO_PORT="$((GATEWAY_PORT + 1))"
WEB_PORT="$((GATEWAY_PORT + 2))"
APP_ORIGIN="http://127.0.0.1:$WEB_PORT"
E2E_BASE_URL="$APP_ORIGIN"
GATEWAY_URL="http://127.0.0.1:$GATEWAY_PORT"
NEXT_DIST_DIR=.next-e2e
export APP_ORIGIN COMPOSE_PROJECT_NAME E2E_BASE_URL GATEWAY_PORT GATEWAY_URL MINIO_PORT NEXT_DIST_DIR

cleanup() {
  if [ -n "${web_pid:-}" ]; then
    kill "$web_pid" 2>/dev/null || true
    wait "$web_pid" 2>/dev/null || true
  fi
  docker compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf apps/web/.next-e2e
}
trap cleanup EXIT INT TERM

docker compose up --build --wait gateway
(cd apps/web && exec ../../node_modules/.bin/next dev --hostname 127.0.0.1 --port "$WEB_PORT") &
web_pid=$!

until curl -fsS "$E2E_BASE_URL/login" >/dev/null; do
  kill -0 "$web_pid"
  sleep 1
done

npx playwright test "$@"
