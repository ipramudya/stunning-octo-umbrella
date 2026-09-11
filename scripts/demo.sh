#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
env_file="${COMPOSE_ENV_FILE:-.env.demo}"

case "${1:-up}" in
  up)
    docker compose --env-file "$env_file" up --build --wait
    docker image prune --force --filter label=com.docker.compose.project=dexa
    ;;
  down)
    docker compose --env-file "$env_file" down --volumes --remove-orphans
    ;;
  *)
    echo "Penggunaan: $0 [up|down]" >&2
    exit 2
    ;;
esac
