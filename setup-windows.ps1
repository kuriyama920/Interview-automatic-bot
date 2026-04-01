# Interview Bot - Windows Setup Script (Firewall-Friendly Edition)
# PowerShell (Admin recommended) で実行してください
# 文字化け防止のため UTF-8 with BOM で保存

param(
    [switch]$SkipSSL,
    [switch]$UseRegistry,
    [switch]$Help
)

if ($Help) {
    Write-Host @"
Interview Bot - Windows Setup Script

Usage:
  .\setup-windows.ps1              # Normal installation
  .\setup-windows.ps1 -SkipSSL     # Skip SSL verification (firewall bypass)
  .\setup-windows.ps1 -UseRegistry # Use taobao registry mirror
  .\setup-windows.ps1 -Help        # Show this help

Options:
  -SkipSSL      : Disable SSL certificate verification
  -UseRegistry  : Use taobao npm registry mirror
"@
    exit 0
}

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Interview Bot - Windows Setup" -ForegroundColor Cyan
Write-Host "Firewall-Friendly Edition" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Node.js Check
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>$null
    if ($nodeVersion) {
        Write-Host "  Node.js version: $nodeVersion" -ForegroundColor Green
    } else {
        throw "Node.js not found"
    }
} catch {
    Write-Host "  ERROR: Node.js is not installed!" -ForegroundColor Red
    Write-Host "  Please install from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# npm Check
Write-Host "[2/5] Checking npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version 2>$null
    Write-Host "  npm version: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: npm is not installed!" -ForegroundColor Red
    exit 1
}

# Firewall Bypass Configuration
Write-Host "[3/5] Configuring npm for corporate environment..." -ForegroundColor Yellow

if ($SkipSSL) {
    Write-Host "  Disabling SSL verification..." -ForegroundColor Cyan
    $env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
    npm config set strict-ssl false
    Write-Host "  SSL verification disabled" -ForegroundColor Green
}

if ($UseRegistry) {
    Write-Host "  Setting taobao registry mirror..." -ForegroundColor Cyan
    npm config set registry https://registry.npmmirror.com
    npm config set electron_mirror https://npmmirror.com/mirrors/electron/
    Write-Host "  Registry mirror configured" -ForegroundColor Green
}

# Always set Electron mirror for corporate networks
Write-Host "  Setting Electron download mirrors..." -ForegroundColor Cyan
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"

# Clean npm cache if previous install failed
Write-Host "[4/5] Cleaning npm cache..." -ForegroundColor Yellow
npm cache clean --force 2>$null
Write-Host "  Cache cleaned" -ForegroundColor Green

# Install Dependencies
Write-Host "[5/5] Installing dependencies..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  This may take several minutes..." -ForegroundColor Cyan
Write-Host ""

npm install --verbose 2>&1 | ForEach-Object {
    if ($_ -match "error|Error|ERROR") {
        Write-Host $_ -ForegroundColor Red
    } elseif ($_ -match "warn|Warn|WARN") {
        Write-Host $_ -ForegroundColor Yellow
    } else {
        Write-Host $_
    }
}

Write-Host ""

if ($LASTEXITCODE -eq 0) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Setup Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  1. Create .env file with your API keys:" -ForegroundColor White
    Write-Host "     SONIOX_API_KEY=your_key_here" -ForegroundColor Gray
    Write-Host "     OPENAI_API_KEY=your_key_here" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  2. Start the application:" -ForegroundColor White
    Write-Host "     npm run dev" -ForegroundColor Green
    Write-Host ""
    Write-Host "  3. Build portable version:" -ForegroundColor White
    Write-Host "     npm run build:portable" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "Installation Failed" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting options:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Option 1: Try with SSL bypass" -ForegroundColor Cyan
    Write-Host "    .\setup-windows.ps1 -SkipSSL" -ForegroundColor White
    Write-Host ""
    Write-Host "  Option 2: Try with registry mirror" -ForegroundColor Cyan
    Write-Host "    .\setup-windows.ps1 -UseRegistry" -ForegroundColor White
    Write-Host ""
    Write-Host "  Option 3: Try both options" -ForegroundColor Cyan
    Write-Host "    .\setup-windows.ps1 -SkipSSL -UseRegistry" -ForegroundColor White
    Write-Host ""
    Write-Host "  Option 4: Use different network (home WiFi, phone tethering)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Option 5: Manual Electron download" -ForegroundColor Cyan
    Write-Host "    1. Download from: https://github.com/electron/electron/releases/tag/v28.3.3" -ForegroundColor White
    Write-Host "    2. File: electron-v28.3.3-win32-x64.zip" -ForegroundColor White
    Write-Host "    3. Extract to: node_modules\electron\dist\" -ForegroundColor White
    Write-Host ""
}

# Restore original npm config if modified
if ($UseRegistry) {
    Write-Host "Note: Registry was changed to npmmirror. To restore:" -ForegroundColor Yellow
    Write-Host "  npm config set registry https://registry.npmjs.org" -ForegroundColor Gray
}
