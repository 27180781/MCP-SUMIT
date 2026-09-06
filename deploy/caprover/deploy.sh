#!/usr/bin/env bash
# Deploy the current git branch to a CapRover app with the CapRover CLI.
#
#   CAPROVER_URL=https://captain.example.com CAPROVER_PASSWORD=... ./deploy/caprover/deploy.sh
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

if [ -n "${CAPROVER_URL:-}" ]; then
  : "${CAPROVER_PASSWORD:?Set CAPROVER_PASSWORD (or use CAPROVER_NAME for a logged-in machine)}"
  exec npx -y caprover@2 deploy -u "$CAPROVER_URL" -p "$CAPROVER_PASSWORD" -a "$APP" -b "$BRANCH"
else
  : "${CAPROVER_NAME:?Set CAPROVER_URL+CAPROVER_PASSWORD, or CAPROVER_NAME of a machine you logged into with 'caprover login'}"
  exec npx -y caprover@2 deploy -n "$CAPROVER_NAME" -a "$APP" -b "$BRANCH"
fi
