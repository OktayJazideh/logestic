# Deploy latest web + backend to VPS when git pull on server fails (DNS).
# Usage: .\scripts\deploy-vps-from-windows.ps1
# Requires: OpenSSH scp/ssh to root@185.36.145.164

$ErrorActionPreference = "Stop"
$VpsHost = "185.36.145.164"
$RemoteRoot = "/opt/logestic/logestic"
$ApiBase = "http://${VpsHost}:4000/api"
$ApkApiBase = "http://${VpsHost}:4000"

Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "==> git pull (local, proxy disabled)"
git -c http.proxy= -c https.proxy= pull

Write-Host "==> build backend (prisma generate + tsc)"
Push-Location apps/backend
npx prisma generate
npm run build
Pop-Location

Write-Host "==> build web (API + mobile APK links in public/downloads, no demo login)"
if (Get-Command flutter -ErrorAction SilentlyContinue) {
    Write-Host "    building mobile APKs (no demo login)..."
    & "$PSScriptRoot\build-apk.ps1" -ApiBaseUrl $ApkApiBase -App both -NoDemoLogin
} else {
    Write-Warning 'Flutter not on PATH - skip APK build. Run .\scripts\build-apk.ps1 manually if login downloads are missing.'
}
Push-Location apps/web
$env:VITE_API_BASE = $ApiBase
$env:VITE_ENABLE_DEMO_LOGIN = "false"
npm run build
$sha = git rev-parse --short HEAD
Write-Host "    web build SHA: $sha"
Pop-Location

Write-Host "==> upload backend dist + prisma (VPS has no github.com DNS)"
scp -r apps/backend/dist "root@${VpsHost}:${RemoteRoot}/apps/backend/"
scp -r apps/backend/prisma "root@${VpsHost}:${RemoteRoot}/apps/backend/"

Write-Host "==> upload web dist"
scp -r apps/web/dist "root@${VpsHost}:${RemoteRoot}/apps/web/"

Write-Host "==> prisma generate + migrate + restart on VPS (skip npm run build on server)"
# Single-quoted: bash uses && on remote; avoids PowerShell parsing ${RemoteRoot} with backslash escapes.
$remoteCmd = 'cd ' + $RemoteRoot + '/apps/backend && npx prisma generate && npx prisma migrate deploy && systemctl restart logestic-api && systemctl reload nginx && curl -sf http://127.0.0.1:4000/api/health && echo OK'
ssh "root@${VpsHost}" $remoteCmd

Write-Host ""
Write-Host "Done. Open http://${VpsHost}"
Write-Host "  - remember-me checkbox on login"
Write-Host "  - demo login buttons"
Write-Host "  - panel version line: $sha"
Write-Host "  - test API: POST /api/auth/__dev/login mobile 09000000000"
