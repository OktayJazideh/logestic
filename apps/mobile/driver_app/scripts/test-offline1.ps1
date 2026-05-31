# OFFLINE-1: run Flutter unit tests 3 times (queue + sync + idempotency).
$ErrorActionPreference = "Stop"
$env:GIT_CONFIG_COUNT = "1"
$env:GIT_CONFIG_KEY_0 = "safe.directory"
$env:GIT_CONFIG_VALUE_0 = "C:/src/flutter"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

for ($i = 1; $i -le 3; $i++) {
  Write-Host "=== OFFLINE-1 run $i/3 ===" -ForegroundColor Cyan
  flutter test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "OFFLINE-1: all 3 runs passed." -ForegroundColor Green
