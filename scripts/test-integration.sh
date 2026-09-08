#!/bin/sh
set -eu

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dexa-integration-$$}"
export COMPOSE_PROJECT_NAME

cleanup() {
  docker compose down --volumes --remove-orphans
}
trap cleanup EXIT INT TERM

docker compose up --build --detach --wait
node tests/integration/walking-skeleton.mjs
node tests/integration/authentication.mjs
node tests/integration/employee-administration.mjs
node tests/integration/session-lifecycle.mjs
