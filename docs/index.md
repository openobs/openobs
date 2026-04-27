# OpenObs

OpenObs is an open-source AI SRE loop for modern operations.

Use natural language to build dashboards, create alerts, investigate incidents, and approve safe fixes.

## Try asking

- `Create a dashboard for checkout latency`
- `Alert me when p95 latency is above 500ms for 10 minutes`
- `Why is checkout latency high right now?`

## What it does

- **Observe** — build and edit dashboards from your real metrics
- **Detect** — create and tune alert rules
- **Investigate** — use metrics, logs, changes, and Kubernetes when configured
- **Act safely** — route risky cluster fixes through approval

## Install

Two supported install paths:

- **[npm](/install/npm)** — single machine. `npx openobs` and you're running.
- **[Kubernetes (Helm)](/install/kubernetes)** — cluster deployment via the official Helm chart.

## Next steps

- [Getting Started](/getting-started) — first-run walkthrough
- [Operator loop](/features/operator-loop) — the product workflow in one page
- [Chat & agents](/features/chat) — what the agent can do
- [Configuration](/configuration) — environment variable reference
- [Authentication](/auth) — users, roles, OAuth/SAML/LDAP, service accounts
- [API Reference](/api-reference) — endpoint documentation
