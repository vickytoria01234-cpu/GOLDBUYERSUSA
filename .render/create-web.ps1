$ErrorActionPreference = "Stop"
$token = "rnd_zxkPddzHsA8p3B9Qbi4KNa7BByeu"
$headers = @{
    "Authorization" = "Bearer $token"
    "Accept" = "application/json"
}

# Static Site - truly free, no card required
$bodyRaw = [ordered]@{
    type = "static_site"
    name = "goldbuyersusa-web"
    ownerId = "tea-d963j3ho3t8c7399ksn0"
    region = "oregon"
    branch = "main"
    rootDir = "web"
    repo = "https://github.com/vickytoria01234-cpu/GOLDBUYERSUSA"
    autoDeploy = "yes"
    envVars = @(
        @{ key = "NODE_ENV"; value = "production" },
        @{ key = "REACT_APP_EXCHANGE_NAME"; value = "GOLDBUYERSUSA" },
        @{ key = "REACT_APP_SERVER_ENDPOINT"; value = "https://goldbuyersusa-server.onrender.com" },
        @{ key = "REACT_APP_PUBLIC_URL"; value = "https://goldbuyersusa-web.onrender.com" },
        @{ key = "CI"; value = "false" }
    )
    serviceDetails = @{
        buildCommand = "npm install && npm run build"
        publishPath = "build"
    }
}

$json = $bodyRaw | ConvertTo-Json -Depth 10 -Compress
Write-Host "Creating frontend Static Site..."
Write-Host "Payload length: $($json.Length) chars"

try {
    $response = Invoke-RestMethod -Uri "https://api.render.com/v1/services" -Method Post -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -ContentType "application/json"
    Write-Host "SUCCESS!"
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    if ($_.ErrorDetails) {
        Write-Host "Details: $($_.ErrorDetails.Message)"
    }
}
