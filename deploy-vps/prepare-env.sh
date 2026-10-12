#!/usr/bin/env bash
# Jalankan dari mana saja pada VPS: bash deploy-vps/prepare-env.sh
set -euo pipefail
cd "$(dirname "$0")"
umask 077
if [ ! -e .env ]; then
  cp .env.example .env
  passwd="$(openssl rand -hex 24)"
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$passwd/" .env
  echo "File .env baru dibuat dengan password database acak."
else
  echo "File .env sudah ada, tidak ditimpa."
fi
if [ ! -e backend.env ]; then
  cp backend.env.example backend.env
  key="base64:$(openssl rand -base64 32 | tr -d '\n')"
  sed -i "s|^APP_KEY=.*|APP_KEY=$key|" backend.env
  echo "File backend.env dibuat dengan APP_KEY acak."
else
  echo "File backend.env sudah ada, tidak ditimpa."
fi
chmod 600 .env backend.env
echo "Sekarang edit domain: nano deploy-vps/.env (jika dari root repo). Jangan upload .env/backend.env ke GitHub."
