#!/usr/bin/env bash
# Fix: API runs old dist because systemd WorkingDirectory != deploy upload path.
# Run on VPS as root after uploading dist from Windows.
set -euo pipefail

REPO="${REPO:-/opt/logestic/logestic}"
BACKEND="${REPO}/apps/backend"
UNIT_FILE="/etc/systemd/system/logestic-api.service"
EXPECTED_WD="${BACKEND}"

echo "==> systemd WorkingDirectory"
WD="$(systemctl show logestic-api -p WorkingDirectory --value 2>/dev/null || true)"
echo "    current: ${WD:-<unknown>}"
echo "    expected: ${EXPECTED_WD}"

has_admin_routes() {
  local dir="$1"
  [ -f "${dir}/dist/routes/adminMines.js" ] && [ -f "${dir}/dist/routes/admin.js" ]
}

echo "==> dist check (upload target)"
if has_admin_routes "${BACKEND}"; then
  echo "    OK ${BACKEND}/dist has admin routes"
else
  echo "    FAIL ${BACKEND}/dist missing admin routes — run deploy from Windows first:"
  echo "          .\\scripts\\deploy-production-hamsahman.ps1"
  exit 1
fi

if [ -n "${WD}" ] && [ "${WD}" != "${EXPECTED_WD}" ]; then
  echo "==> PATH MISMATCH — copying dist+prisma to ${WD}"
  mkdir -p "${WD}/dist" "${WD}/prisma"
  rsync -a --delete "${BACKEND}/dist/" "${WD}/dist/"
  rsync -a "${BACKEND}/prisma/" "${WD}/prisma/"
elif [ -n "${WD}" ] && ! has_admin_routes "${WD}"; then
  echo "==> WorkingDirectory has stale dist — refreshing from ${BACKEND}"
  rsync -a --delete "${BACKEND}/dist/" "${WD}/dist/"
  rsync -a "${BACKEND}/prisma/" "${WD}/prisma/"
fi

EXEC_START="$(systemctl show logestic-api -p ExecStart --value 2>/dev/null || true)"
if echo "${EXEC_START}" | grep -q '/opt/logestic/apps/backend'; then
  echo "==> WRONG ExecStart (old /opt/logestic/apps/backend) — fixing systemd unit"
fi
if [ -f "${REPO}/deploy/config/logestic-api.service" ]; then
  echo "==> install systemd unit (WorkingDirectory=${EXPECTED_WD}, ExecStart=node dist/index.js)"
  cp "${REPO}/deploy/config/logestic-api.service" "${UNIT_FILE}"
  systemctl daemon-reload
else
  echo "==> write systemd unit inline"
  cat > "${UNIT_FILE}" <<EOF
[Unit]
Description=Logestic Backend API (hamsahman.ir)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${EXPECTED_WD}
EnvironmentFile=/etc/logestic/backend.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
fi

echo "==> prisma generate + migrate"
cd "${BACKEND}"
npx prisma generate
npx prisma migrate deploy

echo "==> hard restart (stop + free port 4000)"
systemctl stop logestic-api || true
sleep 1
if command -v fuser >/dev/null 2>&1; then
  fuser -k 4000/tcp 2>/dev/null || true
elif command -v lsof >/dev/null 2>&1; then
  lsof -ti:4000 | xargs -r kill -9 2>/dev/null || true
fi
sleep 1
systemctl start logestic-api
sleep 2
systemctl is-active --quiet logestic-api || {
  echo "FAIL logestic-api not active — journalctl -u logestic-api -n 40"
  exit 1
}

curl -sf http://127.0.0.1:4000/api/health && echo " health OK"

if [ -f "${REPO}/scripts/verify-production-admin.sh" ]; then
  bash "${REPO}/scripts/verify-production-admin.sh"
fi

echo "DONE — admin routes should return 401 (not 404) without token"
