$ErrorActionPreference = "Stop"
$token = "rnd_zxkPddzHsA8p3B9Qbi4KNa7BByeu"
$headers = @{
    "Authorization" = "Bearer $token"
    "Accept" = "application/json"
}

# Correct structure based on OpenAPI spec:
# - serviceDetails.runtime = "node"
# - serviceDetails.envSpecificDetails = { buildCommand, startCommand } (nativeEnvironmentDetailsPOST)
# - top-level envVars = [...] array
$bodyRaw = [ordered]@{
    type = "web_service"
    name = "goldbuyersusa-server"
    ownerId = "tea-d963j3ho3t8c7399ksn0"
    region = "oregon"
    plan = "free"
    branch = "main"
    rootDir = "server"
    repo = "https://github.com/vickytoria01234-cpu/GOLDBUYERSUSA"
    autoDeploy = "yes"
    envVars = @(
        @{ key = "NODE_ENV"; value = "production" },
        @{ key = "API_NAME"; value = "GOLDBUYERSUSA" },
        @{ key = "DOMAIN"; value = "https://goldbuyersusa-server.onrender.com" },
        @{ key = "DB_DIALECT"; value = "postgres" },
        @{ key = "DB_HOST"; value = "dpg-d963rhks728c73f4hq60-a" },
        @{ key = "DB_PORT"; value = "5432" },
        @{ key = "DB_NAME"; value = "goldbuyersusa_db" },
        @{ key = "DB_USERNAME"; value = "goldbuyersusa_db_user" },
        @{ key = "DB_PASSWORD"; value = "9wgINHkydOUiCqFyTGsBzNABuNr6x5UM" },
        @{ key = "REDIS_HOST"; value = "red-d9641usvikkc73dtgiog" },
        @{ key = "REDIS_PORT"; value = "6379" },
        @{ key = "PUBSUB_HOST"; value = "red-d9641usvikkc73dtgiog" },
        @{ key = "PUBSUB_PORT"; value = "6379" },
        @{ key = "NETWORK"; value = "mainnet" },
        @{ key = "PORT"; value = "10010" }
    )
    serviceDetails = @{
        runtime = "node"
        envSpecificDetails = @{
            buildCommand = "npm install"
            startCommand = "npm start"
        }
    }
}

$json = $bodyRaw | ConvertTo-Json -Depth 10 -Compress
Write-Host "Creating backend Web Service..."
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
