#!/usr/bin/env bash
# Run on VPS after deploy — checks admin API routes and mine bootstrap.
set -euo pipefail

API="${API_BASE:-http://127.0.0.1:4000/api}"
TOKEN="${ADMIN_TOKEN:-}"
REPO="${REPO:-/opt/logestic/logestic}"

echo "==> systemd path"
WD="$(systemctl show logestic-api -p WorkingDirectory --value 2>/dev/null || true)"
echo "    WorkingDirectory: ${WD:-<unknown>}"
if [ -n "${WD}" ] && [ -f "${WD}/dist/routes/adminMines.js" ]; then
  echo "    OK adminMines.js in running dist"
elif [ -f "${REPO}/apps/backend/dist/routes/adminMines.js" ]; then
  echo "    WARN admin routes in ${REPO} but NOT in ${WD:-running path}"
  echo "    Run: bash ${REPO}/scripts/fix-vps-api-path.sh"
else
  echo "    FAIL no adminMines.js — deploy dist from Windows first"
fi

echo "==> health"
curl -sf "${API}/health" | head -c 200
echo ""

echo "==> auth login-password (expect 400/401, not 404)"
lp_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API}/auth/login-password" \
  -H "Content-Type: application/json" -d '{"username":"x","password":"y"}')
if [ "$lp_code" = "404" ]; then
  echo "FAIL /auth/login-password → 404 (backend dist stale — redeploy + restart)"
  exit 1
fi
echo "OK /auth/login-password → HTTP ${lp_code}"

echo "==> admin routes (no auth — expect 401, not 404)"
ADMIN_PATHS=(
  /admin/mines
  /admin/users
  /admin/ops-dashboard
  /admin/rules
  /admin/reconciliation/issues
  /admin/user-provisioning/requests
  /audit
  /employer/needs
)
for path in "${ADMIN_PATHS[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "${API}${path}")
  if [ "$code" = "404" ]; then
    echo "FAIL ${path} → 404 (backend dist stale — rebuild + restart logestic-api)"
    exit 1
  fi
  echo "OK ${path} → HTTP ${code}"
done

if [ -n "$TOKEN" ]; then
  echo "==> admin/mines (authenticated)"
  mines_json=$(curl -sf -H "Authorization: Bearer ${TOKEN}" "${API}/admin/mines")
  echo "$mines_json" | head -c 400
  echo ""
  count=$(echo "$mines_json" | grep -o '"id"' | wc -l || true)
  if [ "${count:-0}" -lt 1 ]; then
    echo "WARN: no mines — onboard via /panel/admin/mine-onboard or POST /api/admin/mines/onboard"
  else
    echo "OK mines present"
  fi
else
  echo "SKIP authenticated checks — set ADMIN_TOKEN=... to verify mines catalog"
fi

echo "DONE"
