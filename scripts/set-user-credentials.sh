#!/usr/bin/env bash
# Set login username/password for an existing user on VPS.
set -euo pipefail

REPO="${REPO:-/opt/logestic/logestic}"
cd "${REPO}/apps/backend"
npx tsx scripts/set-user-credentials.ts "$@"
