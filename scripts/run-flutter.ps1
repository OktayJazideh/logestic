# Run Flutter with a project-local git safe.directory for C:/src/flutter.
# Fixes: "fatal: detected dubious ownership in repository at 'C:/src/flutter'"
#
# Usage (from repo root):
#   .\scripts\run-flutter.ps1 test test/weighbridge_read_test.dart
#   $env:LOGESTIC_FLUTTER_PROJECT = "community_app"; .\scripts\run-flutter.ps1 test

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$GitConfig = Join-Path $RepoRoot ".gitconfig.flutter-safe"

if (-not (Test-Path $GitConfig)) {
    Write-Error "Missing $GitConfig - run from a complete logestic checkout."
}

$Project = if ($env:LOGESTIC_FLUTTER_PROJECT) { $env:LOGESTIC_FLUTTER_PROJECT } else { "driver_app" }
if ($Project -notin @("driver_app", "community_app")) {
    Write-Error "LOGESTIC_FLUTTER_PROJECT must be driver_app or community_app"
}

# Project-local git config only for this process (no --global).
$env:GIT_CONFIG_GLOBAL = $GitConfig

# HTTP_PROXY breaks flutter_tester WebSocket on some Windows setups.
Remove-Item Env:HTTP_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:http_proxy -ErrorAction SilentlyContinue
Remove-Item Env:https_proxy -ErrorAction SilentlyContinue

$FlutterRoot = $env:FLUTTER_ROOT
if (-not $FlutterRoot) {
    $onPath = Get-Command flutter -ErrorAction SilentlyContinue
    if ($onPath) {
        $FlutterBin = Split-Path $onPath.Source -Parent
        $FlutterRoot = Split-Path $FlutterBin -Parent
    } else {
        $FlutterRoot = "C:\src\flutter"
    }
}

$FlutterExe = Join-Path $FlutterRoot "bin\flutter.bat"
if (-not (Test-Path $FlutterExe)) {
    Write-Error "Flutter not found at $FlutterExe. Set FLUTTER_ROOT or install Flutter."
}

$AppDir = Join-Path $RepoRoot "apps\mobile\$Project"
if (-not (Test-Path $AppDir)) {
    Write-Error "App directory not found: $AppDir"
}

if ($args.Count -eq 0) {
    Write-Error "Pass Flutter arguments, e.g. .\scripts\run-flutter.ps1 test test/weighbridge_read_test.dart"
}

Push-Location $AppDir
try {
    & $FlutterExe @args
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
