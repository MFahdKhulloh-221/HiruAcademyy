#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
bash -n deploy.sh
# Exercise orchestration with fake commands; never contact Docker or a database.
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
cp deploy.sh "$fixture/deploy.sh"
printf 'DOMAIN=deploy.example.test\nPOSTGRES_PASSWORD=test-only\n' > "$fixture/.env"
printf 'APP_KEY=test-only\n' > "$fixture/backend.env"
printf '#!/bin/sh\nexit 0\n' > "$fixture/git"
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "$DEPLOY_TEST_LOG"\n' > "$fixture/sudo"
chmod +x "$fixture/git" "$fixture/sudo"
export DEPLOY_TEST_LOG="$fixture/commands"
PATH="$fixture:$PATH" bash "$fixture/deploy.sh" > /dev/null
cat > "$fixture/expected" <<'EXPECTED'
docker compose config --quiet
docker compose build backend frontend
docker compose up -d --wait db
docker compose run --rm --no-deps backend php artisan migrate --force --no-interaction
docker compose run --rm --no-deps backend php artisan schedule:list --no-interaction
docker compose up -d --wait
docker compose ps
EXPECTED
diff -u "$fixture/expected" "$DEPLOY_TEST_LOG"
printf 'Deployment orchestration: PASS\n'
