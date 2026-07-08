$ErrorActionPreference = "Stop"
$token = "rnd_zxkPddzHsA8p3B9Qbi4KNa7BByeu"
$headers = @{
    "Authorization" = "Bearer $token"
    "Accept" = "application/json"
}

$blueprint = @{
    ownerID = "tea-d963j3ho3t8c7399ksn0"
    repo = "https://github.com/vickytoria01234-cpu/GOLDBUYERSUSA"
    branch = "main"
    pathToRenderYaml = "render.yaml"
    autopilot = "false"
} | ConvertTo-Json -Compress

Write-Host "Creating Blueprint..."
Write-Host "Payload: $blueprint"
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "https://api.render.com/v1/blueprints" -Method Post -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($blueprint)) -ContentType "application/json"
    Write-Host "SUCCESS! Blueprint created."
    Write-Host "Blueprint ID: $($response.id)"
    Write-Host ""
    Write-Host "Now syncing blueprint..."
    $syncResponse = Invoke-RestMethod -Uri "https://api.render.com/v1/blueprints/$($response.id)/syncs" -Method Post -Headers $headers -Body "{}" -ContentType "application/json"
    Write-Host "Sync started!"
    $syncResponse | ConvertTo-Json -Depth 10
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    if ($_.ErrorDetails) {
        Write-Host "Details: $($_.ErrorDetails.Message)"
    }
}
