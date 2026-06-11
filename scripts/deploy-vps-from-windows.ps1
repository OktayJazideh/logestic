# Deploy latest web + backend to VPS when git pull on server fails (DNS).
# Usage: .\scripts\deploy-vps-from-windows.ps1
# Requires: OpenSSH scp/ssh to root@185.36.145.164

$ErrorActionPreference = "Stop"
$VpsHost = "185.36.145.164"
$RemoteRoot = "/opt/logestic/logestic"
# Web must use same-origin /api (nginx proxy). Direct :4000 is blocked on HTTPS hamsahman.ir.
$ApiBase = "/api"
$ApkApiBase = "http://${VpsHost}:4000"

Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "==> git pull (local, proxy disabled)"
git -c http.proxy= -c https.proxy= pull

Write-Host "==> build backend (prisma generate + tsc)"
Push-Location apps/backend
npx prisma generate
npm run build
Pop-Location

Write-Host "==> build web (API + mobile APK links in public/downloads, demo login enabled)"
if (Get-Command flutter -ErrorAction SilentlyContinue) {
    Write-Host "    building mobile APKs (demo login enabled)..."
    & "$PSScriptRoot\build-apk.ps1" -ApiBaseUrl $ApkApiBase -App both
} else {
    Write-Warning 'Flutter not on PATH - skip APK build. Run .\scripts\build-apk.ps1 manually if login downloads are missing.'
}
Push-Location apps/web
$env:VITE_API_BASE = $ApiBase
$env:VITE_ENABLE_DEMO_LOGIN = "true"
npm run build
$sha = git rev-parse --short HEAD
Write-Host "    web build SHA: $sha"
Pop-Location

Write-Host "==> upload backend dist + prisma (VPS has no github.com DNS)"
scp -r apps/backend/dist "root@${VpsHost}:${RemoteRoot}/apps/backend/"
scp -r apps/backend/prisma "root@${VpsHost}:${RemoteRoot}/apps/backend/"

Write-Host "==> upload web dist"
scp -r apps/web/dist "root@${VpsHost}:${RemoteRoot}/apps/web/"

Write-Host "==> upload fix scripts + nginx"
ssh "root@${VpsHost}" "mkdir -p ${RemoteRoot}/scripts ${RemoteRoot}/deploy/config ${RemoteRoot}/apps/backend/scripts"
scp scripts/fix-vps-api-path.sh scripts/set-user-credentials.sh scripts/verify-production-admin.sh "root@${VpsHost}:${RemoteRoot}/scripts/"
scp apps/backend/scripts/set-user-credentials.ts "root@${VpsHost}:${RemoteRoot}/apps/backend/scripts/"
scp deploy/config/nginx-ip-api.conf "root@${VpsHost}:${RemoteRoot}/deploy/config/"

Write-Host "==> migrate + restart API + nginx on VPS"
$remoteCmd = 'set -e; chmod +x ' + $RemoteRoot + '/scripts/*.sh; cp ' + $RemoteRoot + '/deploy/config/nginx-ip-api.conf /etc/nginx/sites-available/logestic-ip 2>/dev/null || true; ln -sf /etc/nginx/sites-available/logestic-ip /etc/nginx/sites-enabled/logestic-ip 2>/dev/null || true; bash ' + $RemoteRoot + '/scripts/fix-vps-api-path.sh; if nginx -t 2>/dev/null; then systemctl reload nginx; else echo WARN nginx -t failed — fix SSL config for hamsahman.ir; fi'
ssh "root@${VpsHost}" $remoteCmd

Write-Host ""
Write-Host "Done. Open https://hamsahman.ir or http://${VpsHost}"
Write-Host "  - web API base: /api (same-origin)"
Write-Host "  - panel version line: $sha"
Write-Host "  - password login: oktay / oktay1380 (after set-user-credentials in fix-vps-api-path.sh)"
