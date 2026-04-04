import os
import random
import threading
import time

from flask import Flask, Response, jsonify
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

app = Flask(__name__)

SERVICE_NAME = os.getenv("SERVICE_NAME", "worker-sim")
REGION = os.getenv("REGION", "us-central")
ENVIRONMENT = os.getenv("ENVIRONMENT", "testbed")

HTTP_REQUESTS = Counter(
    "http_requests_total",
    "Worker HTTP requests.",
    ["service", "route", "method", "status_code", "region"],
)
HTTP_DURATION = Histogram(
    "http_request_duration_seconds",
    "Worker endpoint latency.",
    ["service", "route", "method", "region"],
    buckets=(0.005, 0.01, 0.03, 0.1, 0.3, 1, 3),
)
QUEUE_DEPTH = Gauge("queue_depth", "Current queue depth.", ["queue"])
CONSUMER_LAG = Gauge("consumer_lag_seconds", "Consumer lag by queue.", ["queue"])
JOBS_PROCESSED = Counter("jobs_processed_total", "Processed jobs.", ["queue", "status"])
JOBS_RETRIED = Counter("jobs_retried_total", "Retried jobs.", ["queue", "reason"])
DLQ_MESSAGES = Gauge("dead_letter_queue_messages", "Dead letter queue depth.", ["queue"])
JOB_DURATION = Histogram(
    "job_duration_seconds",
    "Job processing time.",
    ["queue", "job_type"],
    buckets=(0.01, 0.03, 0.1, 0.3, 1, 3, 10),
)
EXTERNAL_CALL_DURATION = Histogram(
    "external_dependency_duration_seconds",
    "Duration of external dependency calls.",
    ["dependency", "operation"],
    buckets=(0.005, 0.02, 0.05, 0.1, 0.3, 1, 3),
)
EXTERNAL_ERRORS = Counter("external_dependency_errors_total", "External errors.", ["dependency", "reason"])
WORKER_UTIL = Gauge("worker_utilization_ratio", "Synthetic worker utilization ratio.", ["worker_pool"])

QUEUES = ["email", "payments", "fulfillment"]
JOB_TYPES = ["send_email", "capture_payment", "reserve_stock", "ship_order"]


def observe_http(route_name: str):
    def decorator(fn):
        def wrapper(*args, **kwargs):
            start = time.perf_counter()
            code = 200
            try:
                resp = fn(*args, **kwargs)
                if isinstance(resp, tuple):
                    code = resp[1]
                elif hasattr(resp, "status_code"):
                    code = resp.status_code
                return resp
            finally:
                elapsed = time.perf_counter() - start
                HTTP_DURATION.labels(SERVICE_NAME, route_name, "GET", REGION).observe(elapsed)
                HTTP_REQUESTS.labels(SERVICE_NAME, route_name, "GET", str(code), REGION).inc()

        wrapper.__name__ = fn.__name__
        return wrapper

    return decorator


@app.route("/health")
@observe_http("/health")
def health():
    return jsonify({"status": "ok", "service": SERVICE_NAME, "environment": ENVIRONMENT})


@app.route("/metrics")
def metrics():
    return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)


def simulate_workers():
    while True:
        for queue in QUEUES:
            depth = max(0, int(random.gauss(30, 12)))
            lag = max(0.0, random.gauss(8, 6))
            dlq = max(0, int(random.gauss(2, 3)))
            QUEUE_DEPTH.labels(queue=queue).set(depth)
            CONSUMER_LAG.labels(queue=queue).set(lag)
            DLQ_MESSAGES.labels(queue=queue).set(dlq)

            job_type = random.choice(JOB_TYPES)
            duration = max(0.01, random.lognormvariate(-2.0, 0.7))
            JOB_DURATION.labels(queue=queue, job_type=job_type).observe(duration)

            status = random.choices(["success", "failed", "retry"], weights=[0.88, 0.04, 0.08], k=1)[0]
            if status == "retry":
                JOBS_RETRIED.labels(queue=queue, reason=random.choice(["timeout", "dependency_error", "rate_limit"])).inc()
                JOBS_PROCESSED.labels(queue=queue, status="retrying").inc()
            elif status == "failed":
                JOBS_PROCESSED.labels(queue=queue, status="failed").inc()
                EXTERNAL_ERRORS.labels(dependency=random.choice(["postgres", "redis", "payment-gateway"]), reason="upstream_failure").inc()
            else:
                JOBS_PROCESSED.labels(queue=queue, status="success").inc()

            dep = random.choice(["postgres", "redis", "payment-gateway"])
            op = random.choice(["read", "write", "publish"])
            EXTERNAL_CALL_DURATION.labels(dependency=dep, operation=op).observe(max(0.002, random.lognormvariate(-3.0, 0.6)))

        WORKER_UTIL.labels(worker_pool="default").set(random.uniform(0.35, 0.95))
        WORKER_UTIL.labels(worker_pool="priority").set(random.uniform(0.1, 0.8))
        time.sleep(2)


if __name__ == "__main__":
    thread = threading.Thread(target=simulate_workers, daemon=True)
    thread.start()
    app.run(host="0.0.0.0", port=8000)
