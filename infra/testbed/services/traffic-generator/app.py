import os
import random
import time

import requests

GATEWAY_BASE_URL = os.getenv("GATEWAY_BASE_URL", "http://gateway:8080").rstrip("/")
WORKER_BASE_URL = os.getenv("WORKER_BASE_URL", "http://worker-sim:8000").rstrip("/")
TENANTS = ["team-a", "team-b", "enterprise"]


def safe_request(method: str, url: str, **kwargs) -> None:
    try:
        requests.request(method, url, timeout=2.0, **kwargs)
    except requests.RequestException:
        pass


def main() -> None:
    while True:
        tenant = random.choice(TENANTS)
        headers = {"X-Tenant": tenant}
        if random.random() < 0.18:
            headers["X-Canary"] = "always"
        roll = random.random()

        safe_request("GET", f"{GATEWAY_BASE_URL}/", headers=headers)
        safe_request("GET", f"{WORKER_BASE_URL}/health")

        if roll < 0.35:
            safe_request("GET", f"{GATEWAY_BASE_URL}/api/orders", headers=headers)
        elif roll < 0.7:
            safe_request("GET", f"{GATEWAY_BASE_URL}/api/search?q=laptop", headers=headers)
        else:
            safe_request("POST", f"{GATEWAY_BASE_URL}/api/checkout", headers=headers, json={"sku": "sku-red-shirt"})

        if random.random() < 0.2:
            safe_request("GET", f"{GATEWAY_BASE_URL}/api/checkout", headers=headers)

        time.sleep(random.uniform(0.2, 1.2))


if __name__ == "__main__":
    main()
