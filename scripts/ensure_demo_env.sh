#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  if ! awk '
    /^APP_ENV=development$/ { development = 1 }
    /^ALLOW_DEMO_SEED=true$/ { seed = 1 }
    /^PAYMENTS_MOCK=true$/ { mock = 1 }
    /^SECRET_KEY=.{32,}$/ { secret = 1 }
    /^ADMIN_PASSWORD=.{16,}$/ { password = 1 }
    END { exit !(development && seed && mock && secret && password) }
  ' .env; then
    echo ".env exists but is not an explicit safe demo profile."
    echo "Set APP_ENV=development, ALLOW_DEMO_SEED=true, PAYMENTS_MOCK=true, and strong SECRET_KEY/ADMIN_PASSWORD values, or move the file and rerun make demo."
    exit 1
  fi
  echo ".env already contains an explicit demo profile; leaving it unchanged."
  exit 0
fi

demo_secret="$(openssl rand -hex 32)"
demo_admin_password="$(openssl rand -base64 24 | tr -d '\n')"
umask 077
cp .env.example .env

demo_tmp="$(mktemp)"
awk -v secret="$demo_secret" -v password="$demo_admin_password" '
  /^APP_ENV=/ { print "APP_ENV=development"; next }
  /^SECRET_KEY=/ { print "SECRET_KEY=" secret; next }
  /^FRONTEND_URL=/ { print "FRONTEND_URL=http://localhost:5173"; next }
  /^COOKIE_SECURE=/ { print "COOKIE_SECURE=false"; next }
  /^TRUSTED_PROXY_CIDRS=/ { print "TRUSTED_PROXY_CIDRS="; next }
  /^ALLOW_DEMO_SEED=/ { print "ALLOW_DEMO_SEED=true"; next }
  /^MAIL_PREVIEW_URL=/ { print "MAIL_PREVIEW_URL=http://localhost:8025"; next }
  /^PAYMENTS_MOCK=/ { print "PAYMENTS_MOCK=true"; next }
  /^PAYPAL_BASE_URL=/ { print "PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com"; next }
  /^ADMIN_PASSWORD=/ { print "ADMIN_PASSWORD=" password; next }
  { print }
' .env > "$demo_tmp"
mv "$demo_tmp" .env

echo "Created an ignored local .env for the explicit demo profile."
echo "Demo admin: admin@orphaleia.local"
echo "Demo admin password: $demo_admin_password"
