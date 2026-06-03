# Deploy latest web + backend to VPS when git pull on server fails (DNS).
# Usage (PowerShell): .\scripts\deploy-vps-from-windows.ps1
# Requires: OpenSSH scp/ssh, SSH access to root@185.36.145.164

$ErrorActionPreference = "Stop"
$VpsHost = "185.36.145.164"
$RemoteRoot = "/opt/logestic/logestic"
$ApiBase = "http://${VpsHost}:4000/api"

Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "==> git pull (local)"
git -c http.proxy= -c https.proxy= pull

Write-Host "==> build backend"
Push-Location apps/backend
npm run build
Pop-Location

Write-Host "==> build web (demo + API)"
Push-Location apps/web
$env:VITE_API_BASE = $ApiBase
$env:VITE_ENABLE_DEMO_LOGIN = "true"
npm run build
$sha = git rev-parse --short HEAD
Write-Host "    web build SHA: $sha"
Pop-Location

Write-Host "==> upload backend dist"
scp -r apps/backend/dist "root@${VpsHost}:${RemoteRoot}/apps/backend/"

Write-Host "==> upload web dist"
scp -r apps/web/dist "root@${VpsHost}:${RemoteRoot}/apps/web/"

Write-Host "==> restart API on VPS"
ssh "root@${VpsHost}" "systemctl restart logestic-api && systemctl reload nginx && curl -sf http://127.0.0.1:4000/api/health && echo OK"

Write-Host ""
Write-Host "Done. Open http://${VpsHost} — login page should show:"
Write-Host "  - checkbox 'مرا بخاطر داشته باش'"
Write-Host "  - demo buttons + 'نسخه پنل: $sha'"
Write-Host "Test dev login: curl -X POST http://${VpsHost}:4000/api/auth/__dev/login -H 'Content-Type: application/json' -d '{\"mobile_number\":\"09000000000\"}'"
