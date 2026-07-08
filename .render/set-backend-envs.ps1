$ErrorActionPreference = "Stop"
$token = "rnd_zxkPddzHsA8p3B9Qbi4KNa7BByeu"
$serviceId = "srv-d96qjd67r5hc7386n1og"
$headers = @{
    "Authorization" = "Bearer $token"
    "Accept" = "application/json"
}

# All env vars in a single PUT to avoid overwriting
$envVars = @(
    @{ key = "NODE_ENV"; value = "production" },
    @{ key = "API_NAME"; value = "GOLDBUYERSUSA" },
    @{ key = "DOMAIN"; value = "https://goldbuyersusa-server.onrender.com" },
    @{ key = "PORT"; value = "10000" },
    @{ key = "NETWORK"; value = "mainnet" },
    @{ key = "DB_DIALECT"; value = "postgres" },
    @{ key = "DB_HOST"; value = "dpg-d963rhks728c73f4hq60-a" },
    @{ key = "DB_PORT"; value = "5432" },
    @{ key = "DB_NAME"; value = "goldbuyersusa_db" },
    @{ key = "DB_USERNAME"; value = "goldbuyersusa_db_user" },
    @{ key = "DB_PASSWORD"; value = "9wgINHkydOUiCqFyTGsBzNABuNr6x5UM" },
    @{ key = "REDIS_HOST"; value = "red-d9641usvikkc73dtgiog" },
    @{ key = "REDIS_PORT"; value = "6379" },
    @{ key = "PUBSUB_HOST"; value = "red-d9641usvikkc73dtgiog" },
    @{ key = "PUBSUB_PORT"; value = "6379" }
)

$json = $envVars | ConvertTo-Json -Compress
Write-Host "Setting $($envVars.Count) env vars on backend..."

try {
    $response = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$serviceId/env-vars" -Method Put -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -ContentType "application/json"
    Write-Host "SUCCESS! Set $($response.Count) env vars:"
    $response | ForEach-Object { Write-Host "  - $($_.envVar.key)" }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    if ($_.ErrorDetails) { Write-Host "Details: $($_.ErrorDetails.Message)" }
}
