#!/usr/bin/env bash
# Run on VPS after deploy — checks admin API routes and mine bootstrap.
set -euo pipefail

API="${API_BASE:-http://127.0.0.1:4000/api}"
TOKEN="${ADMIN_TOKEN:-}"

echo "==> health"
curl -sf "${API}/health" | head -c 200
echo ""

echo "==> admin routes (no auth — expect 401, not 404)"
for path in /admin/mines /admin/users; do
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
