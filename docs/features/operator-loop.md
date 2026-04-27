# Operator loop

OpenObs is designed as an AI SRE loop: observe, detect, investigate, and act safely.

```text
Observe -> Detect -> Investigate -> Approve fix
```

## Observe

Create and edit dashboards by asking for what you want to see:

> Create a dashboard for checkout latency and error rate

## Detect

Turn monitoring intent into alert rules:

> Alert me when checkout p95 latency is above 500ms for 10 minutes

## Investigate

Ask why something changed:

> Why is latency high right now?

OpenObs can query metrics, search logs, inspect recent changes, and check Kubernetes when configured.

## Act safely

Read-only investigation can run directly. Mutating cluster actions become approval requests before execution.

## Next

The next step is automatic investigation: alerts start the evidence-gathering run and prepare a remediation request for review.

## Related

- [Dashboards](/features/dashboards)
- [Alert rules](/features/alerts)
- [Investigations](/features/investigations)
- [Chat & agents](/features/chat)
