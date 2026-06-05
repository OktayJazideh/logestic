# DEPLOY-SAHMAN-1: production deploy to hamsahman.ir
# Usage: .\scripts\deploy-production-hamsahman.ps1 [-VpsHost 1.2.3.4]
param(
  [string]$VpsHost = "185.36.145.164",
  [string]$Domain = "hamsahman.ir",
  [string]$RemoteRoot = "/opt/logestic/logestic"
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "==> DEPLOY-SAHMAN-1 production: https://$Domain"
Write-Host "==> git pull (local)"
git -c http.proxy= -c https.proxy= pull

Write-Host "==> build backend"
Push-Location apps/backend
npx prisma generate
npm run build
Pop-Location

$ApkApiBase = "https://$Domain"
Write-Host "==> build mobile APKs (API=$ApkApiBase, no demo login)"
if (Get-Command flutter -ErrorAction SilentlyContinue) {
    & "$PSScriptRoot\build-apk.ps1" -ApiBaseUrl $ApkApiBase -NoDemoLogin -App both
} else {
    Write-Warning "Flutter not on PATH — skip APK. Run: .\scripts\build-apk.ps1 -ApiBaseUrl $ApkApiBase -NoDemoLogin"
}

Write-Host "==> build web (no demo login, API same-origin /api)"
Push-Location apps/web
$env:VITE_API_BASE = "/api"
$env:VITE_ENABLE_DEMO_LOGIN = "false"
npm run build
$sha = git rev-parse --short HEAD
Write-Host "    web build SHA: $sha"
Pop-Location

Write-Host "==> upload backend dist + prisma"
scp -r apps/backend/dist "root@${VpsHost}:${RemoteRoot}/apps/backend/"
scp -r apps/backend/prisma "root@${VpsHost}:${RemoteRoot}/apps/backend/"

Write-Host "==> upload web dist"
scp -r apps/web/dist "root@${VpsHost}:${RemoteRoot}/apps/web/"

Write-Host "==> upload nginx + env example (manual merge env on server)"
scp deploy/config/nginx-hamsahman.ir.conf "root@${VpsHost}:${RemoteRoot}/deploy/config/"
scp deploy/config/backend.env.production.example "root@${VpsHost}:${RemoteRoot}/deploy/config/"

$remoteCmd = @"
set -e
if [ ! -f /etc/logestic/backend.env ]; then
  echo 'WARNING: /etc/logestic/backend.env missing — copy deploy/config/backend.env.production.example and set SMS_API_KEY'
fi
if [ -f ${RemoteRoot}/deploy/config/nginx-hamsahman.ir.conf ]; then
  cp ${RemoteRoot}/deploy/config/nginx-hamsahman.ir.conf /etc/nginx/sites-available/hamsahman.ir 2>/dev/null || true
  ln -sf /etc/nginx/sites-available/hamsahman.ir /etc/nginx/sites-enabled/hamsahman.ir 2>/dev/null || true
fi
cd ${RemoteRoot}/apps/backend && npx prisma generate && npx prisma migrate deploy
systemctl restart logestic-api
sleep 2
nginx -t && systemctl reload nginx
curl -sf http://127.0.0.1:4000/api/health && echo ' API health OK'
"@

ssh "root@${VpsHost}" $remoteCmd

Write-Host ""
Write-Host "Done. Open https://$Domain"
Write-Host "  APK downloads: https://$Domain/downloads/logestic-driver.apk"
Write-Host "                 https://$Domain/downloads/logestic-community.apk"
Write-Host "  - Verify SMS: ssh root@$VpsHost 'cd $RemoteRoot && npm -w @app/backend run test:sms-prod1 -- --live'"
Write-Host "  - Ensure /etc/logestic/backend.env has NODE_ENV=production + SMS_*"
Write-Host "  - SSL: certbot --nginx -d $Domain -d www.$Domain (if not yet)"
