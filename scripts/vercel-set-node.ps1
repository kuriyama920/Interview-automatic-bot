# Set Node.js version in Vercel project settings via API
$projectId = "prj_JiyndJ4AlJxmNKhSomrjUFeiujjX"
$teamId = "team_rZoN668uJJ3tUxN4tmIjGrDa"

$authFile = "$env:APPDATA\com.vercel.cli\Data\auth.json"
if (-not (Test-Path $authFile)) {
    Write-Host "Auth file not found at $authFile" -ForegroundColor Red
    exit 1
}

$auth = Get-Content $authFile -Raw | ConvertFrom-Json
$token = $auth.token
Write-Host "Token found (length: $($token.Length))"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}
$body = '{"nodeVersion":"22.x"}'

try {
    $response = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$projectId`?teamId=$teamId" -Method Patch -Headers $headers -Body $body
    Write-Host "Node.js version updated to: $($response.nodeVersion)" -ForegroundColor Green
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host $reader.ReadToEnd()
    } catch {}
}
