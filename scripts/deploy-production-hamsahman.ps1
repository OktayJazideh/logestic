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
    & "$PSScriptRoot\build-apk.ps1" -ApiBaseUrl $ApkApiBase -App both -NoDemoLogin
} else {
    Write-Warning "Flutter not on PATH - skip APK. Run: .\scripts\build-apk.ps1 -ApiBaseUrl $ApkApiBase -NoDemoLogin"
}

Write-Host "==> build web (OTP-only, API same-origin /api)"
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

Write-Host "==> upload verify script + nginx + env example"
ssh "root@${VpsHost}" "mkdir -p ${RemoteRoot}/scripts"
scp scripts/verify-production-admin.sh "root@${VpsHost}:${RemoteRoot}/scripts/"

Write-Host "==> upload nginx + systemd + fix scripts"
ssh "root@${VpsHost}" "mkdir -p ${RemoteRoot}/deploy/config ${RemoteRoot}/scripts"
scp deploy/config/nginx-hamsahman.ir.conf "root@${VpsHost}:${RemoteRoot}/deploy/config/"
scp deploy/config/backend.env.production.example "root@${VpsHost}:${RemoteRoot}/deploy/config/"
scp deploy/config/logestic-api.service "root@${VpsHost}:${RemoteRoot}/deploy/config/"
scp scripts/fix-vps-api-path.sh "root@${VpsHost}:${RemoteRoot}/scripts/"
scp scripts/diagnose-vps-api.sh "root@${VpsHost}:${RemoteRoot}/scripts/"
scp scripts/verify-production-admin.sh "root@${VpsHost}:${RemoteRoot}/scripts/"

Write-Host "==> sync dist to systemd path + migrate + restart on VPS"
# fix-vps-api-path.sh: aligns WorkingDirectory with upload path, restarts API, runs verify.
$remoteCmd = 'set -e; if [ ! -f /etc/logestic/backend.env ]; then echo WARNING: /etc/logestic/backend.env missing; fi; if grep -q "^ENABLE_DEMO_LOGIN=true" /etc/logestic/backend.env 2>/dev/null; then echo WARNING: set ENABLE_DEMO_LOGIN=false in /etc/logestic/backend.env for OTP-only login; fi; if [ -f ' + $RemoteRoot + '/deploy/config/nginx-hamsahman.ir.conf ]; then cp ' + $RemoteRoot + '/deploy/config/nginx-hamsahman.ir.conf /etc/nginx/sites-available/hamsahman.ir 2>/dev/null || true; ln -sf /etc/nginx/sites-available/hamsahman.ir /etc/nginx/sites-enabled/hamsahman.ir 2>/dev/null || true; fi; chmod +x ' + $RemoteRoot + '/scripts/fix-vps-api-path.sh ' + $RemoteRoot + '/scripts/diagnose-vps-api.sh ' + $RemoteRoot + '/scripts/verify-production-admin.sh; bash ' + $RemoteRoot + '/scripts/fix-vps-api-path.sh; nginx -t && systemctl reload nginx'
ssh "root@${VpsHost}" $remoteCmd

Write-Host ""
Write-Host "Done. Open https://$Domain"
Write-Host "  APK downloads: https://$Domain/downloads/logestic-driver.apk"
Write-Host "                 https://$Domain/downloads/logestic-community.apk"
Write-Host "  - On VPS: ENABLE_DEMO_LOGIN=false + SMS_* in /etc/logestic/backend.env"
Write-Host "  - Verify SMS: cd $RemoteRoot && npm -w backend run test:sms-prod1 -- --live"
Write-Host "  - SSL: certbot --nginx -d $Domain -d www.$Domain"
