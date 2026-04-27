# Getting Started

Get OpenObs running in under five minutes.

## 1. Install

Pick the install path that matches your environment:

::: code-group

```bash [npm (single machine)]
npx openobs
```

```bash [Helm (Kubernetes)]
helm upgrade --install openobs \
  oci://ghcr.io/openobs/charts/openobs \
  --namespace observability \
  --create-namespace \
  --set secretEnv.LLM_API_KEY='replace-with-your-provider-key'
```

:::

For more detail, see [Install with npm](/install/npm) or [Install with Helm](/install/kubernetes).

## 2. Open the web UI

The web UI runs on `http://localhost:5173` (npm install) or whatever Ingress / port-forward you configured for the Kubernetes deployment.

The setup wizard walks you through the first three steps:

1. **Create your administrator account** (name, email, password — minimum 12 characters)
2. **Configure an LLM provider** — paste an Anthropic, OpenAI, or Gemini API key, or point at a local Ollama server
3. **Add a datasource** — Prometheus, VictoriaMetrics, Loki, or any compatible backend
4. **Optionally add Kubernetes access** — connect a cluster so investigations can inspect pods, events, rollouts, and safe read-only state

## 3. Try a prompt

Once setup is complete, click the chat button and ask:

> *Create a dashboard for HTTP latency*

OpenObs will discover your metrics, build queries, validate them, and create a dashboard with overview stats, trend charts, and per-handler breakdowns — all grounded in your actual data.

Then try an investigation prompt:

> *Why is checkout latency high right now?*

If metrics, logs, and Kubernetes connectors are configured, OpenObs will query telemetry, inspect cluster state, write a report, and recommend next actions. Mutating cluster actions are not executed directly; they become approval requests.

## Common first prompts

| Goal | Prompt |
|---|---|
| Build a dashboard | `Create a dashboard for checkout latency and errors` |
| Edit a dashboard | `Add p99 latency by route and remove panels with no data` |
| Understand a dashboard | `Explain what this dashboard tells me and what looks abnormal` |
| Create an alert | `Alert me when p95 latency is above 500ms for 10 minutes` |
| Investigate an alert | `Why did the high latency alert fire?` |
| Investigate the cluster | `Check whether Kubernetes is causing the latency spike` |

## What's next

- [Configuration](/configuration) — environment variables for production tuning
- [Chat & agents](/features/chat) — dashboard, alert, investigation, and remediation workflows
- [Authentication](/auth) — adding users, OAuth providers, role-based access control
- [API Reference](/api-reference) — automate via REST and service account tokens
