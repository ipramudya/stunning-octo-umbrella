#!/bin/sh
set -eu

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

CONTRACTS_OUT_DIR="$tmp" npm run generate
diff -ru src/generated "$tmp"
