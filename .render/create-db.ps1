$ErrorActionPreference = "Stop"
$token = "rnd_zxkPddzHsA8p3B9Qbi4KNa7BByeu"
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

$body = @{
    name = "goldbuyersusa-db"
    ownerId = "tea-d963j3ho3t8c7399ksn0"
    region = "oregon"
    plan = "free"
    version = 14
    userDatabase = "goldbuyersusa"
} | ConvertTo-Json

Write-Host "Creating PostgreSQL database..."
Write-Host "Payload: $body"

try {
    $response = Invoke-RestMethod -Uri "https://api.render.com/v1/postgres" -Method Post -Headers $headers -Body $body
    Write-Host "SUCCESS!"
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    if ($_.ErrorDetails) {
        Write-Host "Details: $($_.ErrorDetails.Message)"
    }
}
