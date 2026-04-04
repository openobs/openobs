# Testbed Natural-Language Query Catalog

This document contains only natural-language requests and the expected PromQL that Prism should generate for the local testbed.

## General Dashboards

### Prompt

Build a service health dashboard for `catalog-api` with request volume, error rate, latency, and inflight traffic.

Expected PromQL:

```promql
sum(rate(http_requests_total{service="catalog-api"}[1m])) by (route)
```

```promql
sum(rate(http_requests_total{service="catalog-api",status_code=~"4..|5.."}[5m])) by (route)
/
sum(rate(http_requests_total{service="catalog-api"}[5m])) by (route)
```

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api"}[5m])) by (le, route)
)
```

```promql
sum(http_requests_in_flight{service="catalog-api"}) by (route)
```

### Prompt

Create a RED dashboard for this HTTP service and break it down by route.

Expected PromQL:

```promql
sum(rate(http_requests_total{service="catalog-api"}[1m])) by (route)
```

```promql
sum(rate(http_requests_total{service="catalog-api",status_code=~"4..|5.."}[5m])) by (route)
/
sum(rate(http_requests_total{service="catalog-api"}[5m])) by (route)
```

```promql
histogram_quantile(
  0.50,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api"}[5m])) by (le, route)
)
```

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api"}[5m])) by (le, route)
)
```

### Prompt

Generate a compact service overview dashboard with the 6 to 8 most important panels only.

Expected PromQL:

```promql
sum(rate(http_requests_total{service="catalog-api"}[1m]))
```

```promql
sum(rate(http_requests_total{service="catalog-api",status_code=~"4..|5.."}[5m]))
/
sum(rate(http_requests_total{service="catalog-api"}[5m]))
```

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api"}[5m])) by (le)
)
```

```promql
sum(http_requests_in_flight{service="catalog-api"})
```

### Prompt

Create an on-call dashboard for this service so an engineer can quickly tell whether it is healthy.

Expected PromQL:

```promql
sum(rate(http_requests_total{service="catalog-api"}[1m]))
```

```promql
sum(rate(http_requests_total{service="catalog-api",status_code=~"4..|5.."}[5m]))
/
sum(rate(http_requests_total{service="catalog-api"}[5m]))
```

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api"}[5m])) by (le)
)
```

```promql
avg(business_slo_health_score{service="catalog-api"}) by (region)
```

### Prompt

Build a dashboard grouped by `service` and `route` for request monitoring.

Expected PromQL:

```promql
sum(http_requests_total) by (service, route, status_code)
```

```promql
sum(rate(http_requests_total[1m])) by (service, route)
```

### Prompt

Create a performance troubleshooting dashboard focused on P95, P99, throughput, and error rate.

Expected PromQL:

```promql
sum(rate(http_requests_total{service="catalog-api"}[1m])) by (route)
```

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api"}[5m])) by (le, route)
)
```

```promql
histogram_quantile(
  0.99,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api"}[5m])) by (le, route)
)
```

```promql
sum(rate(http_requests_total{service="catalog-api",status_code=~"4..|5.."}[5m])) by (route)
/
sum(rate(http_requests_total{service="catalog-api"}[5m])) by (route)
```

## Business-Focused Dashboards

### Prompt

Build a checkout dashboard grouped by tenant, payment provider, and success or failure outcome.

Expected PromQL:

```promql
sum(checkout_attempts_total) by (tenant, payment_provider, status)
```

```promql
sum(rate(checkout_attempts_total[5m])) by (tenant, payment_provider, status)
```

### Prompt

Create a search quality dashboard with successful, empty, and partial search results.

Expected PromQL:

```promql
sum(search_queries_total) by (tenant, result)
```

```promql
sum(rate(search_queries_total[5m])) by (tenant, result)
```

### Prompt

Build a cache efficiency dashboard and show hit and miss behavior by operation.

Expected PromQL:

```promql
sum(cache_requests_total) by (operation, outcome)
```

```promql
sum(rate(cache_requests_total{outcome="miss"}[5m])) by (operation)
/
sum(rate(cache_requests_total[5m])) by (operation)
```

### Prompt

Create an inventory risk dashboard with low-stock items and warehouse breakdowns.

Expected PromQL:

```promql
sum(inventory_low_items) by (warehouse)
```

```promql
avg(inventory_stock_level) by (warehouse, sku)
```

### Prompt

Build a business health dashboard with active users and business SLO score by region and tenant.

Expected PromQL:

```promql
avg(active_users) by (tenant, region)
```

```promql
avg(business_slo_health_score{service="catalog-api"}) by (region)
```

### Prompt

Create a dashboard combining order value and database query latency for business and platform review.

Expected PromQL:

```promql
histogram_quantile(
  0.95,
  sum(rate(order_value_usd_bucket[15m])) by (le, tenant)
)
```

```promql
histogram_quantile(
  0.95,
  sum(rate(db_query_duration_seconds_bucket[5m])) by (le, operation, table)
)
```

## Multi-Version, Canary, and Gateway

### Prompt

Build a `catalog-api` v1 versus v2 comparison dashboard with traffic share, latency, and error rate.

Expected PromQL:

```promql
sum(rate(http_requests_total{service="catalog-api"}[5m])) by (version)
```

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api"}[5m])) by (le, version)
)
```

```promql
sum(rate(http_requests_total{service="catalog-api",status_code=~"4..|5.."}[5m])) by (version)
/
sum(rate(http_requests_total{service="catalog-api"}[5m])) by (version)
```

### Prompt

Create a canary release dashboard and highlight whether the new version is degrading compared with the stable version.

Expected PromQL:

```promql
sum(rate(http_requests_total{service="catalog-api"}[5m])) by (version)
```

```promql
sum(rate(http_requests_total{service="catalog-api",status_code=~"4..|5.."}[5m])) by (version)
/
sum(rate(http_requests_total{service="catalog-api"}[5m])) by (version)
```

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api"}[5m])) by (le, version)
)
```

### Prompt

Build a gateway dashboard with total request volume, active connections, and edge traffic behavior.

Expected PromQL:

```promql
sum(rate(nginx_http_requests_total[5m]))
```

```promql
sum(nginx_connections_active)
```

```promql
sum(nginx_connections_reading + nginx_connections_writing + nginx_connections_waiting)
```

### Prompt

Create a dashboard that compares gateway traffic with application-observed traffic.

Expected PromQL:

```promql
sum(rate(nginx_http_requests_total[5m]))
```

```promql
sum(rate(http_requests_total{service="catalog-api"}[5m]))
```

```promql
sum(rate(nginx_http_requests_total[5m])) - sum(rate(http_requests_total{service="catalog-api"}[5m]))
```

### Prompt

Build an ingress-to-application dashboard for watching traffic after a rollout.

Expected PromQL:

```promql
sum(rate(nginx_http_requests_total[5m]))
```

```promql
sum(rate(http_requests_total{service="catalog-api"}[5m])) by (version)
```

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api"}[5m])) by (le, version)
)
```

## Worker and Queue Scenarios

### Prompt

Build a worker health dashboard with queue depth, consumer lag, DLQ, and worker utilization.

Expected PromQL:

```promql
sum(queue_depth) by (queue)
```

```promql
avg(consumer_lag_seconds) by (queue)
```

```promql
sum(dead_letter_queue_messages) by (queue)
```

```promql
avg(worker_utilization_ratio) by (worker_pool)
```

### Prompt

Create an async processing dashboard that focuses on throughput, retries, failures, and job latency.

Expected PromQL:

```promql
sum(rate(jobs_processed_total[5m])) by (queue, status)
```

```promql
sum(rate(jobs_retried_total[5m])) by (queue, reason)
```

```promql
histogram_quantile(
  0.95,
  sum(rate(job_duration_seconds_bucket[5m])) by (le, queue, job_type)
)
```

### Prompt

Build a dashboard for investigating background job backlog.

Expected PromQL:

```promql
sum(queue_depth) by (queue)
```

```promql
avg(consumer_lag_seconds) by (queue)
```

```promql
sum(dead_letter_queue_messages) by (queue)
```

### Prompt

Create a dependency dashboard for the worker and show latency and errors for postgres, redis, and payment-gateway.

Expected PromQL:

```promql
sum(rate(external_dependency_errors_total[5m])) by (dependency, reason)
```

```promql
histogram_quantile(
  0.95,
  sum(rate(external_dependency_duration_seconds_bucket[5m])) by (le, dependency, operation)
)
```

## Infrastructure Dashboards

### Prompt

Build a Redis and Postgres infrastructure dashboard for application troubleshooting.

Expected PromQL:

```promql
sum(redis_up)
```

```promql
sum(redis_connected_clients)
```

```promql
sum(redis_memory_used_bytes)
```

```promql
sum(pg_up)
```

```promql
sum(pg_stat_activity_count) by (datname)
```

### Prompt

Create a Redis health dashboard with client count, memory usage, cache hit rate, and command throughput.

Expected PromQL:

```promql
sum(redis_connected_clients)
```

```promql
sum(redis_memory_used_bytes)
```

```promql
sum(rate(redis_commands_processed_total[5m]))
```

```promql
sum(rate(redis_keyspace_hits_total[5m]))
/
(
  sum(rate(redis_keyspace_hits_total[5m]))
  +
  sum(rate(redis_keyspace_misses_total[5m]))
)
```

### Prompt

Build a Postgres dashboard with connection count, commit and rollback rate, and database size.

Expected PromQL:

```promql
sum(pg_stat_activity_count) by (datname)
```

```promql
sum(rate(pg_stat_database_xact_commit[5m])) by (datname)
```

```promql
sum(rate(pg_stat_database_xact_rollback[5m])) by (datname)
```

```promql
sum(pg_database_size_bytes) by (datname)
```

### Prompt

Create a platform overview dashboard that connects application behavior with Redis and Postgres health.

Expected PromQL:

```promql
sum(rate(http_requests_total{service="catalog-api"}[5m]))
```

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api"}[5m])) by (le)
)
```

```promql
sum(redis_memory_used_bytes)
```

```promql
sum(pg_stat_activity_count) by (datname)
```

## Investigation Prompts

### Prompt

Investigate why checkout failures increased recently.

Expected PromQL:

```promql
sum(rate(checkout_attempts_total[5m])) by (status)
```

```promql
sum(rate(checkout_attempts_total{status="failed"}[5m])) by (payment_provider)
```

```promql
sum(rate(http_requests_total{service="catalog-api",route="/api/checkout",status_code="402"}[5m]))
```

### Prompt

Investigate whether `catalog-api` latency is increasing and identify the worst route.

Expected PromQL:

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api"}[5m])) by (le, route)
)
```

```promql
histogram_quantile(
  0.99,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api"}[5m])) by (le, route)
)
```

### Prompt

Investigate why worker queues are backing up. Check queue depth, lag, retries, and DLQ.

Expected PromQL:

```promql
sum(queue_depth) by (queue)
```

```promql
avg(consumer_lag_seconds) by (queue)
```

```promql
sum(rate(jobs_retried_total[5m])) by (queue, reason)
```

```promql
sum(dead_letter_queue_messages) by (queue)
```

### Prompt

Investigate whether a specific payment provider is causing checkout failures.

Expected PromQL:

```promql
sum(rate(checkout_attempts_total{status="failed"}[5m])) by (payment_provider)
```

```promql
sum(rate(checkout_attempts_total[5m])) by (payment_provider, status)
```

### Prompt

Gateway traffic looks healthy, but business success rate is down. Investigate possible causes.

Expected PromQL:

```promql
sum(rate(nginx_http_requests_total[5m]))
```

```promql
sum(rate(checkout_attempts_total{status="success"}[5m]))
/
sum(rate(checkout_attempts_total[5m]))
```

```promql
sum(rate(search_queries_total{result="empty"}[5m])) by (tenant)
```

### Prompt

Compare `catalog-api` v2 against v1 and determine whether v2 is slower or more error-prone.

Expected PromQL:

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api"}[5m])) by (le, version)
)
```

```promql
sum(rate(http_requests_total{service="catalog-api",status_code=~"4..|5.."}[5m])) by (version)
/
sum(rate(http_requests_total{service="catalog-api"}[5m])) by (version)
```

### Prompt

Investigate whether Redis or Postgres could explain the recent increase in latency.

Expected PromQL:

```promql
sum(redis_memory_used_bytes)
```

```promql
sum(rate(redis_commands_processed_total[5m]))
```

```promql
sum(pg_stat_activity_count) by (datname)
```

```promql
sum(rate(pg_stat_database_xact_rollback[5m])) by (datname)
```

### Prompt

Investigate whether the share of empty search results is increasing.

Expected PromQL:

```promql
sum(rate(search_queries_total{result="empty"}[5m])) by (tenant)
/
sum(rate(search_queries_total[5m])) by (tenant)
```

### Prompt

Investigate whether low inventory in a warehouse is correlated with checkout issues.

Expected PromQL:

```promql
sum(inventory_low_items) by (warehouse)
```

```promql
sum(rate(checkout_attempts_total{status=~"failed|rate_limited"}[5m])) by (tenant)
```

### Prompt

Investigate whether worker external dependency errors show a clear upstream problem.

Expected PromQL:

```promql
sum(rate(external_dependency_errors_total[5m])) by (dependency, reason)
```

```promql
histogram_quantile(
  0.95,
  sum(rate(external_dependency_duration_seconds_bucket[5m])) by (le, dependency, operation)
)
```

## Alert-Generation Prompts

### Prompt

Generate baseline alert rules for `catalog-api` covering high latency, high error rate, and low throughput.

Expected PromQL:

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api"}[5m])) by (le)
)
```

```promql
sum(rate(http_requests_total{service="catalog-api",status_code=~"4..|5.."}[5m]))
/
sum(rate(http_requests_total{service="catalog-api"}[5m]))
```

```promql
sum(rate(http_requests_total{service="catalog-api"}[5m]))
```

### Prompt

Generate alert rules for the worker focused on queue backlog, consumer lag, and DLQ growth.

Expected PromQL:

```promql
sum(queue_depth) by (queue)
```

```promql
avg(consumer_lag_seconds) by (queue)
```

```promql
sum(dead_letter_queue_messages) by (queue)
```

### Prompt

Generate a practical set of gateway alerts for request volume and connection anomalies.

Expected PromQL:

```promql
sum(rate(nginx_http_requests_total[5m]))
```

```promql
sum(nginx_connections_active)
```

### Prompt

Generate baseline Redis and Postgres health alerts for this environment.

Expected PromQL:

```promql
sum(redis_up)
```

```promql
sum(pg_up)
```

```promql
sum(redis_memory_used_bytes)
```

```promql
sum(pg_stat_activity_count) by (datname)
```

### Prompt

Generate a canary alert that fires when v2 error rate is materially worse than v1.

Expected PromQL:

```promql
(
  sum(rate(http_requests_total{service="catalog-api",version="v2",status_code=~"4..|5.."}[5m]))
  /
  sum(rate(http_requests_total{service="catalog-api",version="v2"}[5m]))
)
>
(
  sum(rate(http_requests_total{service="catalog-api",version="v1",status_code=~"4..|5.."}[5m]))
  /
  sum(rate(http_requests_total{service="catalog-api",version="v1"}[5m]))
)
```

## Harder Evaluation Prompts

### Prompt

Build an on-call dashboard that stays small but still makes checkout problems obvious.

Expected PromQL:

```promql
sum(rate(checkout_attempts_total[5m])) by (status)
```

```promql
sum(rate(http_requests_total{service="catalog-api",route="/api/checkout",status_code="402"}[5m]))
```

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api",route="/api/checkout"}[5m])) by (le)
)
```

### Prompt

Create a dashboard that helps answer whether user pain is coming from payments, search, cache, or inventory.

Expected PromQL:

```promql
sum(rate(checkout_attempts_total{status="failed"}[5m])) by (payment_provider)
```

```promql
sum(rate(search_queries_total{result=~"empty|partial"}[5m])) by (tenant)
```

```promql
sum(rate(cache_requests_total{outcome="miss"}[5m])) by (operation)
```

```promql
sum(inventory_low_items) by (warehouse)
```

### Prompt

Build an end-to-end observability dashboard from gateway to app to worker.

Expected PromQL:

```promql
sum(rate(nginx_http_requests_total[5m]))
```

```promql
sum(rate(http_requests_total{service="catalog-api"}[5m])) by (route)
```

```promql
sum(queue_depth) by (queue)
```

```promql
avg(worker_utilization_ratio) by (worker_pool)
```

### Prompt

Do not focus only on system metrics. Show whether users are actually being affected.

Expected PromQL:

```promql
sum(rate(checkout_attempts_total{status=~"failed|rate_limited"}[5m])) by (tenant)
```

```promql
sum(rate(search_queries_total{result=~"empty|partial"}[5m])) by (tenant)
```

```promql
avg(active_users) by (tenant, region)
```

### Prompt

Build a post-deployment dashboard that prioritizes stable versus canary comparison over generic service charts.

Expected PromQL:

```promql
sum(rate(http_requests_total{service="catalog-api"}[5m])) by (version)
```

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api"}[5m])) by (le, version)
)
```

```promql
sum(rate(http_requests_total{service="catalog-api",status_code=~"4..|5.."}[5m])) by (version)
/
sum(rate(http_requests_total{service="catalog-api"}[5m])) by (version)
```

### Prompt

Investigate whether one tenant is having a noticeably worse experience than others.

Expected PromQL:

```promql
sum(rate(checkout_attempts_total{status=~"failed|rate_limited"}[5m])) by (tenant)
```

```promql
sum(rate(search_queries_total{result=~"empty|partial"}[5m])) by (tenant)
```

```promql
avg(active_users) by (tenant)
```

### Prompt

Determine whether the main issue is slowness, errors, or background processing pressure.

Expected PromQL:

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket{service="catalog-api"}[5m])) by (le)
)
```

```promql
sum(rate(http_requests_total{service="catalog-api",status_code=~"4..|5.."}[5m]))
/
sum(rate(http_requests_total{service="catalog-api"}[5m]))
```

```promql
sum(queue_depth) by (queue)
```

```promql
avg(consumer_lag_seconds) by (queue)
```
