import os
import random
import threading
import time
from functools import wraps

from flask import Flask, Response, jsonify, request
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

app = Flask(__name__)

SERVICE_NAME = os.getenv("SERVICE_NAME", "catalog-api")
SERVICE_VERSION = os.getenv("SERVICE_VERSION", "v1")
REGION = os.getenv("REGION", "us-central")
ENVIRONMENT = os.getenv("ENVIRONMENT", "testbed")

HTTP_REQUESTS = Counter(
    "http_requests_total",
    "Total HTTP requests.",
    ["service", "route", "method", "status_code", "tenant", "region", "version"],
)
HTTP_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency.",
    ["service", "route", "method", "tenant", "region", "version"],
    buckets=(0.01, 0.03, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10),
)
HTTP_INFLIGHT = Gauge("http_requests_in_flight", "Current inflight HTTP requests.", ["service", "route"])

CHECKOUT_ATTEMPTS = Counter(
    "checkout_attempts_total",
    "Checkout attempts by provider and result.",
    ["tenant", "payment_provider", "status"],
)
SEARCH_QUERIES = Counter(
    "search_queries_total",
    "Search requests by tenant and result class.",
    ["tenant", "result"],
)
CACHE_REQUESTS = Counter(
    "cache_requests_total",
    "Cache requests by operation and outcome.",
    ["operation", "outcome"],
)
FEATURE_FLAG_EVALS = Counter(
    "feature_flag_evaluations_total",
    "Feature flag evaluations by flag and variant.",
    ["flag", "variant"],
)
DB_QUERY_DURATION = Histogram(
    "db_query_duration_seconds",
    "Database query duration.",
    ["operation", "table"],
    buckets=(0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3),
)
ORDER_VALUE = Histogram(
    "order_value_usd",
    "Order values in USD.",
    ["tenant"],
    buckets=(5, 10, 20, 50, 100, 250, 500, 1000),
)
ACTIVE_USERS = Gauge("active_users", "Approximate active users.", ["tenant", "region"])
INVENTORY_STOCK = Gauge("inventory_stock_level", "Inventory level by SKU and warehouse.", ["sku", "warehouse"])
INVENTORY_LOW = Gauge("inventory_low_items", "Count of low inventory items.", ["warehouse"])
BUSINESS_SLO = Gauge("business_slo_health_score", "Synthetic business SLO score.", ["service", "region"])

TENANTS = ["team-a", "team-b", "enterprise"]
PAYMENT_PROVIDERS = ["stripe", "paypal", "adyen"]
WAREHOUSES = ["toronto", "dallas", "frankfurt"]
SKUS = ["sku-red-shirt", "sku-blue-jeans", "sku-gold-plan", "sku-usb-dock"]


def pick_tenant() -> str:
    return request.headers.get("X-Tenant", random.choice(TENANTS))


def observe_http(route_name: str):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            tenant = pick_tenant()
            HTTP_INFLIGHT.labels(service=SERVICE_NAME, route=route_name).inc()
            start = time.perf_counter()
            status_code = 500
            try:
                response = fn(*args, **kwargs)
                if isinstance(response, tuple):
                    status_code = response[1]
                elif hasattr(response, "status_code"):
                    status_code = response.status_code
                else:
                    status_code = 200
                return response
            finally:
                elapsed = time.perf_counter() - start
                HTTP_INFLIGHT.labels(service=SERVICE_NAME, route=route_name).dec()
                HTTP_DURATION.labels(
                    service=SERVICE_NAME,
                    route=route_name,
                    method=request.method,
                    tenant=tenant,
                    region=REGION,
                    version=SERVICE_VERSION,
                ).observe(elapsed)
                HTTP_REQUESTS.labels(
                    service=SERVICE_NAME,
                    route=route_name,
                    method=request.method,
                    status_code=str(status_code),
                    tenant=tenant,
                    region=REGION,
                    version=SERVICE_VERSION,
                ).inc()

        return wrapper

    return decorator


@app.route("/")
@observe_http("/")
def index():
    time.sleep(random.uniform(0.01, 0.08))
    return jsonify(
        {
            "service": SERVICE_NAME,
            "version": SERVICE_VERSION,
            "region": REGION,
            "environment": ENVIRONMENT,
        }
    )


@app.route("/health")
@observe_http("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/orders")
@observe_http("/api/orders")
def orders():
    tenant = pick_tenant()
    DB_QUERY_DURATION.labels(operation="select", table="orders").observe(random.uniform(0.002, 0.03))
    CACHE_REQUESTS.labels(operation="orders_list", outcome=random.choice(["hit", "miss"])).inc()
    FEATURE_FLAG_EVALS.labels(flag="new-order-list", variant=random.choice(["on", "off"])).inc()
    time.sleep(random.uniform(0.03, 0.12))
    return jsonify({"tenant": tenant, "orders": random.randint(2, 20)})


@app.route("/api/search")
@observe_http("/api/search")
def search():
    tenant = pick_tenant()
    result = random.choices(["ok", "empty", "partial"], weights=[0.8, 0.15, 0.05], k=1)[0]
    SEARCH_QUERIES.labels(tenant=tenant, result=result).inc()
    CACHE_REQUESTS.labels(operation="search", outcome=random.choice(["hit", "miss"])).inc()
    DB_QUERY_DURATION.labels(operation="search", table="catalog").observe(random.uniform(0.005, 0.08))
    time.sleep(random.uniform(0.02, 0.2))
    return jsonify({"tenant": tenant, "result": result, "items": random.randint(0, 12)})


@app.route("/api/checkout", methods=["POST", "GET"])
@observe_http("/api/checkout")
def checkout():
    tenant = pick_tenant()
    provider = random.choice(PAYMENT_PROVIDERS)
    roll = random.random()
    DB_QUERY_DURATION.labels(operation="insert", table="orders").observe(random.uniform(0.01, 0.12))
    ORDER_VALUE.labels(tenant=tenant).observe(random.uniform(12, 450))
    if roll < 0.08:
        CHECKOUT_ATTEMPTS.labels(tenant=tenant, payment_provider=provider, status="failed").inc()
        time.sleep(random.uniform(0.1, 0.6))
        return jsonify({"error": "payment_declined", "provider": provider}), 402
    if roll < 0.12:
        CHECKOUT_ATTEMPTS.labels(tenant=tenant, payment_provider=provider, status="rate_limited").inc()
        time.sleep(random.uniform(0.2, 1.0))
        return jsonify({"error": "try_again_later", "provider": provider}), 429
    CHECKOUT_ATTEMPTS.labels(tenant=tenant, payment_provider=provider, status="success").inc()
    time.sleep(random.uniform(0.06, 0.4))
    return jsonify({"ok": True, "provider": provider, "tenant": tenant})


@app.route("/metrics")
def metrics():
    return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)


def background_metrics():
    while True:
        for tenant in TENANTS:
            ACTIVE_USERS.labels(tenant=tenant, region=REGION).set(random.randint(20, 300))
        low_total = 0
        for warehouse in WAREHOUSES:
            warehouse_low = 0
            for sku in SKUS:
                value = random.randint(0, 250)
                INVENTORY_STOCK.labels(sku=sku, warehouse=warehouse).set(value)
                if value < 30:
                    warehouse_low += 1
            INVENTORY_LOW.labels(warehouse=warehouse).set(warehouse_low)
            low_total += warehouse_low
        score = max(70, 99 - low_total * 1.5 - random.uniform(0, 3))
        BUSINESS_SLO.labels(service=SERVICE_NAME, region=REGION).set(score)
        FEATURE_FLAG_EVALS.labels(flag="smart-recs", variant=random.choice(["control", "treatment"])).inc(random.randint(2, 10))
        time.sleep(5)


if __name__ == "__main__":
    thread = threading.Thread(target=background_metrics, daemon=True)
    thread.start()
    app.run(host="0.0.0.0", port=8000)
