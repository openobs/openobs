<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/public/rounds-logo-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="docs/public/rounds-logo.svg" />
    <img src="docs/public/rounds-logo.svg" width="80" height="80" alt="Rounds logo" />
  </picture>
</p>

<h1 align="center">Rounds</h1>

<p align="center">
  <strong>AI does rounds on your production.</strong><br />
  Self-hosted AI SRE — investigate incidents, build dashboards, manage alerts, and approve remediations from natural language.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@syntropize/rounds"><img src="https://img.shields.io/npm/v/@syntropize/rounds.svg?color=cb3837" alt="npm" /></a>
  <a href="https://github.com/syntropize/rounds/actions/workflows/ci.yml"><img src="https://github.com/syntropize/rounds/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/syntropize/rounds/blob/main/LICENSE"><img src="https://img.shields.io/github/license/syntropize/rounds" alt="License" /></a>
  <a href="https://docs.rounds.dev"><img src="https://img.shields.io/badge/docs-docs.rounds.dev-blue" alt="Docs" /></a>
</p>

<p align="center">
  <a href="https://syntropize.com">Website</a> &middot;
  <a href="https://docs.rounds.dev">Documentation</a> &middot;
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#what-can-it-do">What it does</a> &middot;
  <a href="#deploy">Deploy</a>
</p>

---

<p align="center">
  <a href="https://www.youtube.com/watch?v=EbNIbS2uY3o">
    <img src="https://img.youtube.com/vi/EbNIbS2uY3o/maxresdefault.jpg" width="760" alt="Rounds demo — watch on YouTube" />
  </a>
</p>
<p align="center"><sub>▶ <a href="https://www.youtube.com/watch?v=EbNIbS2uY3o">Watch the 1-minute demo on YouTube</a></sub></p>

## Quick Start

Install the latest release package:

```bash
npm install -g @syntropize/rounds
rounds
```

Then open **http://localhost:3000** and follow the setup wizard.

Try:

- `Create a dashboard for HTTP latency`
- `Alert me when p95 latency is above 500ms for 10 minutes`
- `Why is checkout latency high right now?`

## What can it do?

- **Observe** — create, edit, clone, explain, and delete dashboards from natural language.
- **Detect** — create and tune alert rules through chat, with preview and backtest before save.
- **Investigate** — correlate metrics, logs, recent changes, and (when connected) Kubernetes state, with citations on every claim.
- **Remediate safely** — propose fixes; user-driven actions confirm in chat (Run / Confirm / Apply), background-agent actions go through formal approval (Approve / Reject / Modify) with owner / on-call notification.
- **Configure by chat** — add datasources, ops connectors, and low-risk org settings through the agent (gated by RBAC and the GuardedAction risk model).

Kubernetes is the first deep production workflow. Planned integrations include Prometheus alerting rules, Loki log routing, GitHub deploys, Jira / PagerDuty incident sync, CI/CD systems, and database read connectors — these are clearly marked as PLANNED in the docs and not promised by the current release.

Learn more in the [docs](https://docs.rounds.dev).

## Deploy

Install with Helm:

```bash
helm install rounds oci://ghcr.io/syntropize/charts/rounds \
  --namespace observability --create-namespace
```

The default Helm install creates a private `ClusterIP` service. For a local
kind/minikube-style cluster, access it with:

```bash
kubectl -n observability port-forward svc/rounds 3000:80
```

Then open **http://127.0.0.1:3000** and complete the setup wizard. For shared
access, expose Rounds with Ingress or `service.type=LoadBalancer`.

By default, npm uses a local SQLite database file under
`~/.rounds/rounds.db`. The Helm chart can also run that way on a PVC at
`/var/lib/rounds/rounds.db`, but production Kubernetes installs should set
`secretEnv.DATABASE_URL` before first start so every Rounds repository uses
Postgres. Treat the database backend as an install-time choice: changing it
later does not migrate existing data.

See the [Kubernetes install guide](https://docs.rounds.dev/install/kubernetes) for access, storage, and persistence options.

## Build from source

```bash
git clone https://github.com/syntropize/rounds.git && cd rounds
npm install
npm run build
npm run start
```

## More

- [Documentation](https://docs.rounds.dev)
- [Architecture](./ARCHITECTURE.md)
- [Contributing](./CONTRIBUTING.md)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, code style, and where to put new code.

## License

[AGPL-3.0-or-later](./LICENSE) — Copyright (c) Syntropize.
