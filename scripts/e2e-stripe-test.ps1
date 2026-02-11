# Stripe E2E Test Script
# Phase 7: Stripe テストモードでの E2E 動作確認

$baseUrl = "https://api-kuriyama-natos-projects.vercel.app"

Write-Host "=== Stripe E2E Test ===" -ForegroundColor Cyan
Write-Host ""

# 1. Health Check
Write-Host "[1/5] Health Check" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -Method Get
    Write-Host "  Status: $($health.status)" -ForegroundColor Green
    Write-Host "  Timestamp: $($health.timestamp)"
    if ($health.env) {
        Write-Host "  Env vars:"
        $health.env.PSObject.Properties | ForEach-Object {
            $color = if ($_.Value) { "Green" } else { "Red" }
            Write-Host "    $($_.Name): $($_.Value)" -ForegroundColor $color
        }
    }
} catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 2. Subscription (no auth - expect 401)
Write-Host "[2/5] /api/subscription (no auth - expect 401)" -ForegroundColor Yellow
try {
    $sub = Invoke-WebRequest -Uri "$baseUrl/api/subscription" -Method Get -UseBasicParsing
    Write-Host "  UNEXPECTED: Status $($sub.StatusCode)" -ForegroundColor Red
    Write-Host "  Body: $($sub.Content)"
} catch {
    $statusCode = [int]$_.Exception.Response.StatusCode
    Write-Host "  Status: $statusCode" -ForegroundColor $(if ($statusCode -eq 401) { "Green" } else { "Red" })
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        Write-Host "  Body: $body"
    } catch {
        Write-Host "  (Could not read response body)"
    }
}

Write-Host ""

# 3. Stripe Checkout (no auth - expect 401)
Write-Host "[3/5] /api/stripe/checkout (no auth - expect 401)" -ForegroundColor Yellow
try {
    $body = '{"priceId":"price_1SzYTIEFLs3ImTfQeP6B8cbR"}'
    $checkout = Invoke-WebRequest -Uri "$baseUrl/api/stripe/checkout" -Method Post -Body $body -ContentType "application/json" -UseBasicParsing
    Write-Host "  UNEXPECTED: Status $($checkout.StatusCode)" -ForegroundColor Red
} catch {
    $statusCode = [int]$_.Exception.Response.StatusCode
    Write-Host "  Status: $statusCode" -ForegroundColor $(if ($statusCode -eq 401) { "Green" } else { "Red" })
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        Write-Host "  Body: $body"
    } catch {
        Write-Host "  (Could not read response body)"
    }
}

Write-Host ""

# 4. Stripe Portal (no auth - expect 401)
Write-Host "[4/5] /api/stripe/portal (no auth - expect 401)" -ForegroundColor Yellow
try {
    $portal = Invoke-WebRequest -Uri "$baseUrl/api/stripe/portal" -Method Post -ContentType "application/json" -UseBasicParsing
    Write-Host "  UNEXPECTED: Status $($portal.StatusCode)" -ForegroundColor Red
} catch {
    $statusCode = [int]$_.Exception.Response.StatusCode
    Write-Host "  Status: $statusCode" -ForegroundColor $(if ($statusCode -eq 401) { "Green" } else { "Red" })
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        Write-Host "  Body: $body"
    } catch {
        Write-Host "  (Could not read response body)"
    }
}

Write-Host ""

# 5. Stripe Webhook (invalid signature - expect 400)
Write-Host "[5/5] /api/stripe/webhook (invalid sig - expect 400)" -ForegroundColor Yellow
try {
    $webhookBody = '{"type":"checkout.session.completed","data":{"object":{}}}'
    $headers = @{
        "stripe-signature" = "t=1234567890,v1=invalid_signature"
    }
    $webhook = Invoke-WebRequest -Uri "$baseUrl/api/stripe/webhook" -Method Post -Body $webhookBody -ContentType "application/json" -Headers $headers -UseBasicParsing
    Write-Host "  UNEXPECTED: Status $($webhook.StatusCode)" -ForegroundColor Red
} catch {
    $statusCode = [int]$_.Exception.Response.StatusCode
    Write-Host "  Status: $statusCode" -ForegroundColor $(if ($statusCode -eq 400) { "Green" } else { "Red" })
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        Write-Host "  Body: $body"
    } catch {
        Write-Host "  (Could not read response body)"
    }
}

Write-Host ""
Write-Host "=== Unauthenticated tests complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next: Run authenticated tests with a valid JWT token." -ForegroundColor Yellow
Write-Host "Provide a JWT token to test checkout flow, subscription data, and portal."
