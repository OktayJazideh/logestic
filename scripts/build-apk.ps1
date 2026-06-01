# Build release APK for driver_app or community_app.
#
# Prerequisites (one-time on Windows):
#   1. Flutter SDK (C:\src\flutter or FLUTTER_ROOT)
#   2. Android Studio OR Android SDK + JDK 17
#   3. ANDROID_HOME pointing at SDK (e.g. %LOCALAPPDATA%\Android\Sdk)
#
# Usage (from repo root):
#   .\scripts\build-apk.ps1 -ApiBaseUrl "https://api.example.ir"
#   .\scripts\build-apk.ps1 -App community_app -ApiBaseUrl "https://api.example.ir"
#
param(
    [ValidateSet("driver_app", "community_app")]
    [string]$App = "driver_app",
    [Parameter(Mandatory = $true)]
    [string]$ApiBaseUrl
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent

if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
    $defaultSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    if (Test-Path $defaultSdk) {
        $env:ANDROID_HOME = $defaultSdk
    }
}

$env:LOGESTIC_FLUTTER_PROJECT = $App

Write-Host "Building $App APK with API_BASE_URL=$ApiBaseUrl"
if ($env:ANDROID_HOME) {
    Write-Host "ANDROID_HOME=$($env:ANDROID_HOME)"
} else {
    Write-Warning "ANDROID_HOME not set. Install Android Studio or set ANDROID_HOME to your SDK path."
}

Push-Location $RepoRoot
try {
    & "$RepoRoot\scripts\run-flutter.ps1" pub get
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & "$RepoRoot\scripts\run-flutter.ps1" build apk --release `
        "--dart-define=API_BASE_URL=$ApiBaseUrl"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $apk = Join-Path $RepoRoot "apps\mobile\$App\build\app\outputs\flutter-apk\app-release.apk"
    if (Test-Path $apk) {
        Write-Host ""
        Write-Host "APK ready:" -ForegroundColor Green
        Write-Host "  $apk"
    } else {
        Write-Error "Build finished but APK not found at $apk"
    }
} finally {
    Pop-Location
}
