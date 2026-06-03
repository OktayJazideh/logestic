#!/usr/bin/env bash
# Run on VPS after dist+prisma were uploaded from PC (deploy-vps-from-windows.ps1).
# git pull often fails on VPS: "Could not resolve host: github.com"
set -euo pipefail

REPO="${REPO:-/opt/logestic/logestic}"
cd "$REPO/apps/backend"

echo "==> prisma generate + migrate (uses schema uploaded from PC)"
npx prisma generate
npx prisma migrate deploy

echo "==> restart API (runs pre-built dist/ — do not npm run build here; server src may be old)"
systemctl restart logestic-api
sleep 2
curl -sf http://127.0.0.1:4000/api/health && echo " health OK"

echo "Done. Deploy code from Windows when github.com is unreachable on VPS."
