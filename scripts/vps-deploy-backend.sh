#!/usr/bin/env bash
# Run on VPS as root after git pull (see docs below).
set -euo pipefail

REPO="${REPO:-/opt/logestic/logestic}"
cd "$REPO"

# If git pull fails with "dubious ownership", run once:
#   git config --global --add safe.directory /opt/logestic/logestic

echo "==> backend: prisma + build"
cd apps/backend
npx prisma generate
npx prisma migrate deploy
npm run build

echo "==> restart API"
systemctl restart logestic-api
sleep 2
curl -sf http://127.0.0.1:4000/api/health && echo " health OK"

echo "==> probe user-provisioning (needs admin token for 200)"
curl -sf -o /dev/null -w "admin user-provisioning HTTP %{http_code}\n" \
  http://127.0.0.1:4000/api/admin/user-provisioning/requests || true

echo "Done. If provisioning returns 404, dist is stale — run this script again after git pull."
