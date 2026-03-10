# Stripe E2E Test Script
# Phase 7: Stripe テストモードでの E2E 動作確認
#
# 使用法:
#   .\scripts\e2e-stripe-test.ps1                          # 非認証テストのみ
#   .\scripts\e2e-stripe-test.ps1 -JwtToken "eyJhbG..."   # 認証テスト含む

param(
    [string]$BaseUrl = "https://api.interviewbot.app",
    [string]$JwtToken = ""
)

$passed = 0
$failed = 0
$total = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Uri,
        [string]$Method = "Get",
        [string]$Body = "",
        [hashtable]$Headers = @{},
        [int]$ExpectedStatus,
        [scriptblock]$BodyCheck = $null
    )

    $script:total++
    Write-Host "  [$script:total] $Name" -NoNewline

    try {
        $params = @{
            Uri = $Uri
            Method = $Method
            UseBasicParsing = $true
            ErrorAction = "Stop"
        }
        if ($Body) {
            $params.Body = $Body
            $params.ContentType = "application/json"
        }
        if ($Headers.Count -gt 0) {
            $params.Headers = $Headers
        }

        $response = Invoke-WebRequest @params
        $statusCode = [int]$response.StatusCode
    } catch {
        $statusCode = [int]$_.Exception.Response.StatusCode
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $responseBody = $reader.ReadToEnd()
        } catch {
            $responseBody = ""
        }
    }

    if (-not $responseBody -and $response) {
        $responseBody = $response.Content
    }

    if ($statusCode -eq $ExpectedStatus) {
        $bodyOk = $true
        if ($BodyCheck) {
            $bodyOk = & $BodyCheck $responseBody
        }
        if ($bodyOk) {
            Write-Host " -> PASS ($statusCode)" -ForegroundColor Green
            $script:passed++
        } else {
            Write-Host " -> FAIL (body check failed)" -ForegroundColor Red
            Write-Host "    Body: $responseBody" -ForegroundColor DarkGray
            $script:failed++
        }
    } else {
        Write-Host " -> FAIL (expected $ExpectedStatus, got $statusCode)" -ForegroundColor Red
        if ($responseBody) {
            Write-Host "    Body: $responseBody" -ForegroundColor DarkGray
        }
        $script:failed++
    }
}

# ==============================================================
Write-Host ""
Write-Host "=== Stripe E2E Tests ===" -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl"
Write-Host ""

# ==============================================================
# Part 1: 非認証テスト (セキュリティ検証)
# ==============================================================

Write-Host "[Part 1] Security - Unauthenticated Access" -ForegroundColor Yellow
Write-Host ""

Test-Endpoint -Name "Health Check" `
    -Uri "$BaseUrl/api/health" -Method "Get" `
    -ExpectedStatus 200

Test-Endpoint -Name "Subscription (no auth -> 401)" `
    -Uri "$BaseUrl/api/subscription" -Method "Get" `
    -ExpectedStatus 401

Test-Endpoint -Name "Checkout (no auth -> 401)" `
    -Uri "$BaseUrl/api/stripe/checkout" -Method "Post" `
    -Body '{"priceId":"price_test"}' `
    -ExpectedStatus 401

Test-Endpoint -Name "Portal (no auth -> 401)" `
    -Uri "$BaseUrl/api/stripe/portal" -Method "Post" `
    -ExpectedStatus 401

Test-Endpoint -Name "Webhook (no signature -> 400)" `
    -Uri "$BaseUrl/api/stripe/webhook" -Method "Post" `
    -Body '{"type":"test"}' `
    -ExpectedStatus 400

Test-Endpoint -Name "Webhook (invalid signature -> 400)" `
    -Uri "$BaseUrl/api/stripe/webhook" -Method "Post" `
    -Body '{"type":"checkout.session.completed","data":{"object":{}}}' `
    -Headers @{ "stripe-signature" = "t=1234567890,v1=invalid_signature" } `
    -ExpectedStatus 400

Test-Endpoint -Name "Success page (public -> 200)" `
    -Uri "$BaseUrl/api/stripe/success" -Method "Get" `
    -ExpectedStatus 200 `
    -BodyCheck { param($b) $b -match "<!DOCTYPE html>" -and $b -match "決済が完了しました" }

Test-Endpoint -Name "Cancel page (public -> 200)" `
    -Uri "$BaseUrl/api/stripe/cancel" -Method "Get" `
    -ExpectedStatus 200 `
    -BodyCheck { param($b) $b -match "<!DOCTYPE html>" -and $b -match "決済がキャンセルされました" }

Write-Host ""

# ==============================================================
# Part 2: 認証テスト (JWT トークン必要)
# ==============================================================

if ($JwtToken) {
    Write-Host "[Part 2] Authenticated Flow Tests" -ForegroundColor Yellow
    Write-Host ""

    $authHeaders = @{ "Authorization" = "Bearer $JwtToken" }

    Test-Endpoint -Name "Subscription (with auth -> 200)" `
        -Uri "$BaseUrl/api/subscription" -Method "Get" `
        -Headers $authHeaders `
        -ExpectedStatus 200 `
        -BodyCheck { param($b)
            $json = $b | ConvertFrom-Json
            $null -ne $json.subscription -and $null -ne $json.usage -and $null -ne $json.plans
        }

    Test-Endpoint -Name "Checkout - missing priceId (-> 400)" `
        -Uri "$BaseUrl/api/stripe/checkout" -Method "Post" `
        -Body '{}' `
        -Headers $authHeaders `
        -ExpectedStatus 400

    Test-Endpoint -Name "Checkout - invalid priceId (-> 400)" `
        -Uri "$BaseUrl/api/stripe/checkout" -Method "Post" `
        -Body '{"priceId":"price_nonexistent_xxx"}' `
        -Headers $authHeaders `
        -ExpectedStatus 400

    Test-Endpoint -Name "Portal (with auth -> 200)" `
        -Uri "$BaseUrl/api/stripe/portal" -Method "Post" `
        -Headers $authHeaders `
        -ExpectedStatus 200 `
        -BodyCheck { param($b)
            $json = $b | ConvertFrom-Json
            $json.url -match "stripe\.com"
        }

    Write-Host ""
} else {
    Write-Host "[Part 2] Skipped - No JWT token provided" -ForegroundColor DarkGray
    Write-Host "  Run with: .\scripts\e2e-stripe-test.ps1 -JwtToken `"eyJhbG...`"" -ForegroundColor DarkGray
    Write-Host ""
}

# ==============================================================
# Results
# ==============================================================

Write-Host "=== Results ===" -ForegroundColor Cyan
Write-Host "  Total:  $total"
Write-Host "  Passed: $passed" -ForegroundColor Green
Write-Host "  Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })
Write-Host ""

if ($failed -gt 0) {
    Write-Host "SOME TESTS FAILED" -ForegroundColor Red
    exit 1
} else {
    Write-Host "ALL TESTS PASSED" -ForegroundColor Green
    exit 0
}
