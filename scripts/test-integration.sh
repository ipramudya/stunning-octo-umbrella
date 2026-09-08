#!/bin/sh
set -eu

cleanup() {
  docker compose down --volumes --remove-orphans
}
trap cleanup EXIT INT TERM

docker compose up --build --detach --wait
node tests/integration/walking-skeleton.mjs
