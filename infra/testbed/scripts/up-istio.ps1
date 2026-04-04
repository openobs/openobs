$ErrorActionPreference = "Stop"

function Assert-Command([string]$name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $name"
  }
}

Assert-Command "kind"
Assert-Command "kubectl"
Assert-Command "istioctl"

$root = Split-Path -Parent $PSScriptRoot
$clusterName = "prism-testbed"

$clusters = kind get clusters
if ($clusters -notcontains $clusterName) {
  kind create cluster --name $clusterName --config (Join-Path $root "k8s/kind-config.yaml")
}

istioctl install -y --set profile=demo
kubectl apply -f (Join-Path $root "k8s/namespace.yaml")
kubectl apply -f (Join-Path $root "k8s/apps.yaml")
kubectl apply -f (Join-Path $root "k8s/istio-gateway.yaml")

Write-Host ""
Write-Host "Istio testbed deployed." -ForegroundColor Green
Write-Host "Ingress HTTP: http://localhost:8088" -ForegroundColor Gray
Write-Host "Tip: port-forward Prometheus or install addons if you want full in-cluster dashboards." -ForegroundColor Gray
Write-Host "Note: replace ghcr.io/placeholder/* images with your built testbed images before deploying." -ForegroundColor Yellow
