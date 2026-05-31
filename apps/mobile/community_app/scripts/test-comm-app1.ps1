# COMM-APP-1: run community_app + mineral_api + driver_app unit tests 3 times
$ErrorActionPreference = "Stop"
# Localhost proxy breaks flutter_tester WebSocket (Invalid WebSocket upgrade request).
$env:HTTP_PROXY = ''
$env:HTTPS_PROXY = ''
$env:ALL_PROXY = ''
$env:NO_PROXY = '*'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$pkg = Join-Path $root "packages\mineral_api"
$comm = Join-Path $root "community_app"
$driver = Join-Path $root "driver_app"

function Run-FlutterTest($dir, $label) {
  Push-Location $dir
  try {
    flutter pub get | Out-Null
    for ($i = 1; $i -le 3; $i++) {
      Write-Host "[$label] run $i/3 ..."
      flutter test
      if ($LASTEXITCODE -ne 0) { throw "flutter test failed ($label) run $i" }
    }
  } finally {
    Pop-Location
  }
}

Run-FlutterTest $pkg "mineral_api"
Run-FlutterTest $comm "community_app"
Run-FlutterTest $driver "driver_app"
Write-Host "COMM-APP-1: all 3x passes OK"
