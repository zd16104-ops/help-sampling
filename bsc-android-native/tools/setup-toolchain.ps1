# Build-environment setup: downloads Gradle 8.9 and the Android SDK 35 into
# <workspace>/android-toolchain for the proxy-based build (gradle-with-proxy.js
# expects gradle at ../android-toolchain/gradle-8.9). Run once per machine:
#
#   powershell -ExecutionPolicy Bypass -File tools\setup-toolchain.ps1
#
# Creates android-toolchain/ next to this project (workspace root) and a
# machine-specific local.properties is still required afterwards (see README).

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$workspace = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$root = Join-Path $workspace 'android-toolchain'
$sdks = Join-Path $root 'sdk'
New-Item -ItemType Directory -Force -Path $root | Out-Null

function Download-File([string]$Uri, [string]$Out) {
  if (Test-Path $Out) { Write-Host "skip (exists): $Out"; return }
  Write-Host "downloading: $Uri"
  Invoke-WebRequest -Uri $Uri -OutFile $Out -UseBasicParsing
  Write-Host "done: $Out ($([math]::Round((Get-Item $Out).Length/1MB,1)) MB)"
}

# --- Gradle 8.9 ---
if (-not (Test-Path (Join-Path $root 'gradle-8.9\bin\gradle.bat'))) {
  Download-File 'https://services.gradle.org/distributions/gradle-8.9-bin.zip' (Join-Path $root 'gradle.zip')
  Write-Host 'extracting gradle...'
  Expand-Archive (Join-Path $root 'gradle.zip') -DestinationPath $root -Force
  Remove-Item (Join-Path $root 'gradle.zip')
}

# --- Android cmdline-tools ---
$sdkmanager = Join-Path $sdks 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $sdkmanager)) {
  Download-File 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' (Join-Path $root 'cmdline-tools.zip')
  Write-Host 'extracting cmdline-tools...'
  Expand-Archive (Join-Path $root 'cmdline-tools.zip') -DestinationPath (Join-Path $root 'cmdtools') -Force
  New-Item -ItemType Directory -Force -Path (Join-Path $sdks 'cmdline-tools') | Out-Null
  Move-Item (Join-Path $root 'cmdtools\cmdline-tools') (Join-Path $sdks 'cmdline-tools\latest') -Force
  Remove-Item (Join-Path $root 'cmdline-tools.zip')
}

$env:ANDROID_HOME = $sdks
$env:ANDROID_SDK_ROOT = $sdks

# --- Accept licenses ---
Write-Host 'accepting SDK licenses...'
$yes = (1..40 | ForEach-Object { 'y' }) -join "`n"
$yes | & $sdkmanager --licenses 2>&1 | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) { Write-Host 'license step reported non-zero (may still be ok)' }

# --- Install packages ---
Write-Host 'installing platform-tools, platforms;android-35, build-tools;35.0.0...'
& $sdkmanager 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0' 2>&1 | Select-Object -Last 8
Write-Host "toolchain setup finished, exit=$LASTEXITCODE"
