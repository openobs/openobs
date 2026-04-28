# Kubernetes with Helm

OpenObs includes a first-party Helm chart in this repository at `helm/openobs`.

## Basic install

```bash
helm upgrade --install openobs oci://ghcr.io/openobs/charts/openobs \
  --namespace observability \
  --create-namespace
```

This installs a private `ClusterIP` service, which is reachable from inside the
cluster. For local evaluation, use `kubectl port-forward`; for shared access,
configure Ingress or a load balancer.

## Common overrides

- `secretEnv.JWT_SECRET`: explicit JWT secret
- `secretEnv.DATABASE_URL`: use Postgres instead of local SQLite mode
- `secretEnv.REDIS_URL`: enable Redis-backed features
- `persistence.enabled`: keep local state on a PVC
- `ingress.enabled`: expose the app through an Ingress controller
- `service.type`: set to `LoadBalancer` or `NodePort` when your cluster supports it

LLM credentials are configured in the web setup flow after first login.

## Ingress example

```bash
helm upgrade --install openobs oci://ghcr.io/openobs/charts/openobs \
  --namespace observability \
  --create-namespace \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.hosts[0].host=openobs.example.com \
  --set env.CORS_ORIGINS=https://openobs.example.com
```

## LoadBalancer example

```bash
helm upgrade --install openobs oci://ghcr.io/openobs/charts/openobs \
  --namespace observability \
  --create-namespace \
  --set service.type=LoadBalancer
```
