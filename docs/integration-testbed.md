# Integration Testbed

This testbed gives Prism a repeatable metrics playground for dashboard generation, investigation, and alert-rule testing.

## Goals

- Continuously generate metrics without manual traffic.
- Cover common app patterns:
  - HTTP request rate, latency, status-code mix
  - background worker / queue metrics
  - business metrics such as checkout, inventory, search, feature flags
- Cover infra-adjacent metrics:
  - process CPU / memory / GC
  - Redis exporter metrics
  - Postgres exporter metrics
  - NGINX gateway metrics
- Provide an Istio + gateway scenario for service-mesh and ingress testing.

## Local Docker Scenario

Files live under [`infra/testbed`](/C:/Users/shiqi/Documents/prism/infra/testbed).

### Services

- `catalog-api`
  - standard `http_requests_total`
  - `http_request_duration_seconds`
  - checkout / search / cache / DB / inventory / active user metrics
- `worker-sim`
  - queue depth
  - consumer lag
  - processed / retried / failed jobs
  - external dependency duration / error metrics
- `gateway`
  - NGINX reverse proxy in front of `catalog-api`
- `nginx-exporter`
  - gateway metrics for ingress-style dashboards
- `redis` + `redis-exporter`
- `postgres` + `postgres-exporter`
- `traffic-generator`
  - continuously drives realistic traffic so dashboards always have data

### One-click commands

```powershell
pwsh ./infra/testbed/scripts/up.ps1
pwsh ./infra/testbed/scripts/down.ps1
```

Or from the repo root:

```powershell
npm run testbed:up
npm run testbed:down
```

### Endpoints

- Gateway: `http://localhost:8080`
- Catalog metrics: `http://localhost:8081/metrics`
- Catalog v2 metrics: `http://localhost:8083/metrics`
- Worker metrics: `http://localhost:8082/metrics`
- NGINX exporter: `http://localhost:9113/metrics`
- Redis exporter: `http://localhost:9121/metrics`
- Postgres exporter: `http://localhost:9187/metrics`

### Existing Prometheus Integration

The Docker testbed is designed to feed an existing local Prometheus instance.

If your existing Prometheus runs on Docker Desktop, the recommended scrape targets are:

- `host.docker.internal:8081`
- `host.docker.internal:8082`
- `host.docker.internal:8083`
- `host.docker.internal:9113`
- `host.docker.internal:9121`
- `host.docker.internal:9187`

## Covered Metric Shapes

### Generic / common Prometheus patterns

- `http_requests_total`
- `http_request_duration_seconds_bucket`
- `process_*`
- `python_gc_*`

### App-specific metrics

- `checkout_attempts_total`
- `search_queries_total`
- `cache_requests_total`
- `feature_flag_evaluations_total`
- `db_query_duration_seconds`
- `order_value_usd`
- `inventory_stock_level`
- `inventory_low_items`
- `business_slo_health_score`

### Worker / async metrics

- `queue_depth`
- `consumer_lag_seconds`
- `jobs_processed_total`
- `jobs_retried_total`
- `dead_letter_queue_messages`
- `job_duration_seconds`
- `external_dependency_duration_seconds`
- `external_dependency_errors_total`

### Infra / platform metrics

- Redis exporter metrics
- Postgres exporter metrics
- NGINX gateway metrics
- process / runtime metrics from all Python services

## Windows-First Note

If you are developing on plain Windows, the supported local path is the Docker testbed.

The local Docker setup already covers:

- gateway metrics
- stable/canary routing
- multi-version application traffic
- business + worker + exporter metrics

So you can do most integration testing without Kubernetes.

## Optional Istio Scenario

This repo also includes a mesh-oriented testbed under [`infra/testbed/k8s`](/C:/Users/shiqi/Documents/prism/infra/testbed/k8s).

It is designed for:

- service-to-service traffic in Kubernetes
- Istio sidecar metrics
- ingress gateway routing
- canary traffic via `DestinationRule` + `VirtualService`

### One-click commands

```powershell
pwsh ./infra/testbed/scripts/up-istio.ps1
pwsh ./infra/testbed/scripts/down-istio.ps1
```

### Notes

- This is optional and not required for Windows local development.
- `kind`, `kubectl`, and `istioctl` are required locally.
- The Kubernetes manifests currently reference placeholder images:
  - `ghcr.io/placeholder/catalog-api:latest`
  - `ghcr.io/placeholder/worker-sim:latest`
- Replace those with real published images, or load locally-built images into `kind`.

## Why this helps Prism

This gives the agent realistic coverage for:

- standard HTTP dashboards
- gateway and reverse-proxy dashboards
- queue / worker investigations
- mixed business + infrastructure signals
- mesh / ingress / canary routing scenarios

It is intentionally broader than a single toy API so we can test whether agents overfit to one metric family.
