#!/usr/bin/env bash
# Deploy the current git branch to a CapRover app with the CapRover CLI.
#
#   CAPROVER_URL=https://captain.example.com CAPROVER_PASSWORD=... ./deploy/caprover/deploy.sh
#   CAPROVER_URL=https://captain.example.com CAPROVER_APP_TOKEN=... ./deploy/caprover/deploy.sh   # app token instead of password
#   CAPROVER_NAME=sumit ./deploy/caprover/deploy.sh            # machine already logged in (caprover login)
#   CAPROVER_APP=sumit-mcp CAPROVER_BRANCH=main ./deploy/caprover/deploy.sh
#
# Notes:
# * `caprover deploy -b <branch>` uploads the COMMITTED tree of that branch – commit your changes first.
# * The app must already exist in CapRover (create it once with "Has Persistent Data" checked).
set -euo pipefail

APP="${CAPROVER_APP:-sumit-mcp}"
BRANCH="${CAPROVER_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  Working tree has uncommitted changes – only committed files on branch '$BRANCH' will be deployed." >&2
fi

CLI="npx -y caprover@2.4.4"
if [ -n "${CAPROVER_URL:-}" ]; then
  if [ -n "${CAPROVER_APP_TOKEN:-}" ]; then
    # App token (App → Deployment → Enable App Token): no master password needed. Read from the env by the CLI.
    exec $CLI deploy -u "$CAPROVER_URL" -a "$APP" -b "$BRANCH"
  fi
  : "${CAPROVER_PASSWORD:?Set CAPROVER_PASSWORD or CAPROVER_APP_TOKEN (or use CAPROVER_NAME for a logged-in machine)}"
  # The CLI reads CAPROVER_PASSWORD from the environment, so it never appears on the command line / in `ps`.
  exec $CLI deploy -u "$CAPROVER_URL" -a "$APP" -b "$BRANCH"
else
  : "${CAPROVER_NAME:?Set CAPROVER_URL+CAPROVER_PASSWORD, or CAPROVER_NAME of a machine you logged into with 'caprover login'}"
  exec $CLI deploy -n "$CAPROVER_NAME" -a "$APP" -b "$BRANCH"
fi
