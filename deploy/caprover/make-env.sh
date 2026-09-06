#!/usr/bin/env bash
# Prints a ready-to-paste environment block for CapRover
# (App → App Configs → Environment Variables → Bulk Edit) with freshly generated secrets.
#
#   ./deploy/caprover/make-env.sh https://sumit-mcp.apps.example.com
#
set -euo pipefail
APP_URL="${1:-}"
if [ -z "$APP_URL" ]; then
  echo "Usage: $0 https://<app-name>.<root-domain>" >&2
  exit 1
fi
APP_URL="${APP_URL%/}"

rand_hex() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "$1"; else head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}
MASTER_KEY="$(rand_hex 32)"
ADMIN_PASSWORD="$(rand_hex 12)"

cat <<ENV
NODE_ENV=production
PORT=8080
HOST=0.0.0.0
DATA_DIR=/data
PUBLIC_URL=$APP_URL
TRUST_PROXY=1
MASTER_KEY=$MASTER_KEY
ADMIN_PASSWORD=$ADMIN_PASSWORD
ALLOW_URL_TOKENS=false
OAUTH_ENABLED=true
SUMIT_BASE_URL=https://api.sumit.co.il
ENV

cat >&2 <<NOTE

# Save these two values somewhere safe (password manager):
#   MASTER_KEY     = $MASTER_KEY   (encrypts the SUMIT API keys; without it the stored accounts cannot be read)
#   ADMIN_PASSWORD = $ADMIN_PASSWORD   (login to $APP_URL/admin)
NOTE
