# Build release APKs for driver_app and community_app; copy to web public for login downloads.
#
# Usage (from repo root):
#   Staging (IP + demo login):
#     .\scripts\build-apk.ps1 -ApiBaseUrl "http://185.36.145.164:4000"
#   Production UAT (domain + demo login):
#     .\scripts\build-apk.ps1 -ApiBaseUrl "https://hamsahman.ir"
#
param(
    [ValidateSet("driver_app", "community_app", "both")]
    [string]$App = "both",
    [Parameter(Mandatory = $true)]
    [string]$ApiBaseUrl,
    [switch]$NoDemoLogin
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent

if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
    $defaultSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    if (Test-Path $defaultSdk) {
        $env:ANDROID_HOME = $defaultSdk
    }
}

$downloadDir = Join-Path $RepoRoot "apps\web\public\downloads"
New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null

$demoDefine = if ($NoDemoLogin) { @() } else { @("--dart-define=ENABLE_DEMO_LOGIN=true") }

function Build-OneApk {
    param([string]$Project)

    $env:LOGESTIC_FLUTTER_PROJECT = $Project
    Write-Host ""
    Write-Host "==> Building $Project (API_BASE_URL=$ApiBaseUrl)" -ForegroundColor Cyan

    & "$RepoRoot\scripts\run-flutter.ps1" pub get
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $buildArgs = @(
        "build", "apk", "--release",
        "--dart-define=API_BASE_URL=$ApiBaseUrl"
    ) + $demoDefine

    & "$RepoRoot\scripts\run-flutter.ps1" @buildArgs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $src = Join-Path $RepoRoot "apps\mobile\$Project\build\app\outputs\flutter-apk\app-release.apk"
    if (-not (Test-Path $src)) {
        Write-Error "Build finished but APK not found at $src"
    }

    $destName = if ($Project -eq "driver_app") { "logestic-driver.apk" } else { "logestic-community.apk" }
    $dest = Join-Path $downloadDir $destName
    Copy-Item -Force $src $dest
    Write-Host "APK copied:" -ForegroundColor Green
    Write-Host "  $dest"
}

Push-Location $RepoRoot
try {
    if ($env:ANDROID_HOME) {
        Write-Host "ANDROID_HOME=$($env:ANDROID_HOME)"
    } else {
        Write-Warning "ANDROID_HOME not set. Install Android Studio or set ANDROID_HOME to your SDK path."
    }

    if ($App -eq "both") {
        Build-OneApk "driver_app"
        Build-OneApk "community_app"
    } else {
        Build-OneApk $App
    }

    Write-Host ""
    Write-Host "Download URLs (after web build/deploy):" -ForegroundColor Green
    Write-Host "  /downloads/logestic-driver.apk"
    Write-Host "  /downloads/logestic-community.apk"
} finally {
    Pop-Location
}
