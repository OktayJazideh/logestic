#!/usr/bin/env bash
# Diagnose why /api/admin/* returns 404 while dist files exist.
set -euo pipefail

REPO="${REPO:-/opt/logestic/logestic}"
BACKEND="${REPO}/apps/backend"
API="${API_BASE:-http://127.0.0.1:4000/api}"

echo "==> systemd"
WD="$(systemctl show logestic-api -p WorkingDirectory --value 2>/dev/null || true)"
EXEC="$(systemctl show logestic-api -p ExecStart --value 2>/dev/null || true)"
MAIN_PID="$(systemctl show logestic-api -p MainPID --value 2>/dev/null || true)"
echo "    WorkingDirectory: ${WD:-<unknown>}"
echo "    ExecStart: ${EXEC:-<unknown>}"
if [ -n "${EXEC}" ] && echo "${EXEC}" | grep -q '/opt/logestic/apps/backend'; then
  echo "    FAIL ExecStart points to OLD path /opt/logestic/apps/backend (without logestic/)"
  echo "    Fix: cp ${REPO}/deploy/config/logestic-api.service /etc/systemd/system/ && systemctl daemon-reload && systemctl restart logestic-api"
elif [ -n "${EXEC}" ] && echo "${EXEC}" | grep -qE 'node /opt/logestic/logestic/apps/backend/dist'; then
  echo "    OK ExecStart uses absolute path to new dist"
elif [ -n "${EXEC}" ] && echo "${EXEC}" | grep -q 'node dist/index.js'; then
  echo "    OK ExecStart uses relative dist/index.js (cwd = WorkingDirectory)"
fi
if [ -n "${MAIN_PID}" ] && [ -d "/proc/${MAIN_PID}" ]; then
  echo "    process cwd: $(readlink -f /proc/${MAIN_PID}/cwd 2>/dev/null || echo '?')"
  echo "    process cmd: $(tr '\0' ' ' < /proc/${MAIN_PID}/cmdline 2>/dev/null || echo '?')"
fi

echo "==> port 4000 listeners"
ss -tlnp | grep ':4000' || echo "    (none)"

echo "==> dist files"
for f in dist/index.js dist/app.js dist/routes/admin.js dist/routes/adminMines.js; do
  if [ -f "${BACKEND}/${f}" ]; then
    echo "    OK ${f} ($(stat -c '%y %s' "${BACKEND}/${f}" 2>/dev/null || stat -f '%Sm %z' "${BACKEND}/${f}"))"
  else
    echo "    MISSING ${f}"
  fi
done

echo "==> admin.js mounts adminMines?"
if grep -q adminMines "${BACKEND}/dist/routes/admin.js" 2>/dev/null; then
  echo "    OK grep adminMines in admin.js"
else
  echo "    FAIL admin.js does NOT reference adminMines — upload full dist from Windows"
fi

echo "==> live HTTP (running service)"
for path in /health /workspaces /admin/mines /admin/users /admin/ops-dashboard; do
  code=$(curl -s -o /tmp/diag-body.txt -w "%{http_code}" "${API}${path}")
  body=$(head -c 120 /tmp/diag-body.txt)
  echo "    ${path} → HTTP ${code}  ${body}"
done

echo "==> offline smoke (fresh node from dist on disk)"
cd "${BACKEND}"
node <<'NODE'
const http = require("http");
const { initAppContext } = require("./dist/lib/appInit");
const { createApp } = require("./dist/app");

(async () => {
  try {
    await initAppContext();
    const app = createApp();
    const server = app.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      http.get(`http://127.0.0.1:${port}/api/admin/mines`, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          console.log(`    offline /api/admin/mines → HTTP ${res.statusCode}  ${body.slice(0, 120)}`);
          if (res.statusCode === 401) {
            console.log("    OK dist on disk is correct (401 without token)");
            console.log("    => running systemd process is NOT using this dist — kill port 4000 and restart");
          } else if (res.statusCode === 404) {
            console.log("    FAIL dist on disk is stale — redeploy full backend dist from Windows");
          }
          server.close();
        });
      }).on("error", (e) => {
        console.error("    smoke request failed:", e.message);
        server.close();
      });
    });
  } catch (e) {
    console.error("    smoke boot failed:", e);
    process.exit(1);
  }
})();
NODE

echo "DONE"
