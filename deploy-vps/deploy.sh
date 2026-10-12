#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "Jalankan bash deploy-vps/prepare-env.sh dahulu."; exit 1; }
[ -f backend.env ] || { echo "backend.env belum ada."; exit 1; }
domain="$(sed -n 's/^DOMAIN=//p' .env | tail -n1)"
if [[ ! "$domain" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}$ ]] || [[ "$domain" == "domain-anda.com" ]]; then
  echo "Ganti DOMAIN di deploy-vps/.env dengan domain asli terlebih dahulu."; exit 1
fi
if grep -Eq '^POSTGRES_PASSWORD=(GANTI.*|)$' .env; then
  echo "Password DB masih placeholder."; exit 1
fi
if grep -Eq '^APP_KEY=$' backend.env; then
  echo "APP_KEY kosong."; exit 1
fi
if ! git -C .. cat-file -e '94bce6e^{commit}' 2>/dev/null; then
  echo "PERINGATAN: commit 94bce6e tidak ditemukan pada checkout ini."
  echo "Pastikan repository/branch berisi commit terbaru (git remote -v; git log -1 --oneline)."
  echo "Untuk keamanan, deploy dibatalkan agar bukan kode lama yang tayang."
  exit 1
fi
if ! git -C .. merge-base --is-ancestor 94bce6e HEAD; then
  echo "Commit 94bce6e tidak termasuk riwayat HEAD ini; cek branch target."; exit 1
fi
chmod 600 .env backend.env
sudo docker compose config --quiet
sudo docker compose up -d --build
sudo docker compose ps
printf '\nLanjutkan cek: curl -I https://%s/ && curl -i https://%s/up\n' "$domain" "$domain"
