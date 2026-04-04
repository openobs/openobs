$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Write-Host "Starting local observability testbed..." -ForegroundColor Cyan
docker compose -f (Join-Path $root "docker-compose.yml") up -d --build
Write-Host ""
Write-Host "Testbed is starting." -ForegroundColor Green
Write-Host "Gateway:     http://localhost:8080" -ForegroundColor Gray
Write-Host "Catalog API: http://localhost:8081/metrics" -ForegroundColor Gray
Write-Host "Catalog v2:  http://localhost:8083/metrics" -ForegroundColor Gray
Write-Host "Worker Sim:  http://localhost:8082/metrics" -ForegroundColor Gray
Write-Host "Nginx exp.:  http://localhost:9113/metrics" -ForegroundColor Gray
Write-Host "Redis exp.:  http://localhost:9121/metrics" -ForegroundColor Gray
Write-Host "Postgres ex: http://localhost:9187/metrics" -ForegroundColor Gray
Write-Host "Use your existing Prometheus on :9090 to scrape these targets." -ForegroundColor Gray
