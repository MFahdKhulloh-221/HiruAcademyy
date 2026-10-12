#!/usr/bin/env bash
# Jalankan di VPS Ubuntu: bash deploy-vps/setup-ubuntu.sh
set -euo pipefail
if [ ! -f /etc/os-release ]; then echo "OS tidak terdeteksi"; exit 1; fi
. /etc/os-release
if [ "${ID:-}" != "ubuntu" ]; then echo "Script hanya untuk Ubuntu; OS=$ID"; exit 1; fi
sudo apt-get update
sudo apt-get install -y ca-certificates curl git openssl
if ! command -v docker >/dev/null 2>&1; then
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  ARCH="$(dpkg --print-architecture)"
  CODENAME="${UBUNTU_CODENAME:-${VERSION_CODENAME}}"
  printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' "$CODENAME" "$ARCH" | sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
sudo systemctl enable --now docker
sudo docker --version
sudo docker compose version
printf '\nDocker terpasang. Periksa firewall Sumopod agar 22 (batasi IP), 80, dan 443 inbound diizinkan.\n'
