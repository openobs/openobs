import type { ActionContext } from './_context.js';
import { withToolEventBoundary } from './_shared.js';

export async function handleOpsRunCommand(
  ctx: ActionContext,
  args: Record<string, unknown>,
): Promise<string> {
  const connectorId = typeof args.connectorId === 'string' ? args.connectorId.trim() : '';
  const command = typeof args.command === 'string' ? args.command.trim() : '';
  const intent = typeof args.intent === 'string' && args.intent.trim()
    ? args.intent.trim()
    : 'read';

  return withToolEventBoundary(
    ctx.sendEvent,
    'ops.run_command',
    { connectorId, command, intent },
    connectorId ? `Running ops command on ${connectorId}` : 'Running ops command',
    async () => {
      if (!ctx.opsCommandRunner) {
        return 'Ops command runner is not configured. Connect a Kubernetes/Ops integration before querying cluster state.';
      }
      if (!connectorId) {
        return 'ops.run_command requires connectorId. List configured Ops connectors in Settings and choose one before running a command.';
      }
      if (!command) {
        return 'ops.run_command requires a command.';
      }

      const connectors = ctx.opsConnectors ?? await ctx.opsCommandRunner.listConnectors?.();
      if (Array.isArray(connectors)) {
        if (connectors.length === 0) {
          return 'No Ops connectors are configured. Connect a Kubernetes/Ops integration before querying cluster state.';
        }
        const selected = connectors.find((connector) => connector.id === connectorId);
        if (!selected) {
          return `Ops connector "${connectorId}" is not configured. Choose one of: ${connectors.map((connector) => connector.id).join(', ')}.`;
        }
      }

      const result = await ctx.opsCommandRunner.runCommand({
        connectorId,
        command,
        intent,
        identity: ctx.identity,
        sessionId: ctx.sessionId,
      });

      return formatOpsCommandResult(result);
    },
  );
}

function formatOpsCommandResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    if (typeof record.observation === 'string') return record.observation;
    if (typeof record.summary === 'string') return record.summary;
    if (typeof record.message === 'string') return record.message;
    return JSON.stringify(record);
  }
  return String(result ?? 'Ops command completed with no output.');
}
