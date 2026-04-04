$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Write-Host "Stopping local observability testbed..." -ForegroundColor Cyan
docker compose -f (Join-Path $root "docker-compose.yml") down -v
