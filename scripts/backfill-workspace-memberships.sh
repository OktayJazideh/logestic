#!/usr/bin/env bash
# Backfill user_workspace_memberships on VPS after workspace security deploy.
set -euo pipefail

REPO="${REPO:-/opt/logestic/logestic}"
cd "${REPO}/apps/backend"
npx tsx scripts/backfill-workspace-memberships.ts
