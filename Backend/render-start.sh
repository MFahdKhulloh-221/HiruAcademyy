#!/bin/sh
set -eu
export APP_ENV=production APP_DEBUG=false
port="${PORT:-10000}"
case "$port" in ''|*[!0-9]*) exit 1 ;; esac
[ "$port" -ge 1 ] && [ "$port" -le 65535 ]
mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache
php artisan package:discover --no-interaction
php artisan config:cache
php artisan migrate --force --no-interaction
sed -i "s/^Listen 80$/Listen $port/" /etc/apache2/ports.conf
sed -i "s/<VirtualHost \*:80>/<VirtualHost *:$port>/" /etc/apache2/sites-available/000-default.conf
exec apache2-foreground
