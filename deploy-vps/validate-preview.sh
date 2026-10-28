#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null
[ -f .env ] && [ -f backend.env ] || { echo 'Missing existing VPS configuration; do not copy local secrets.' >&2; exit 1; }
docker compose config --quiet
# Run standalone validator, not production service or published ports.
docker run --rm --network none -e DOMAIN=hiruacademy.id \
  -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
printf '%s\n' 'Config validation only. Full restore NOT authorized. Do not use deploy.sh for cutover.'
