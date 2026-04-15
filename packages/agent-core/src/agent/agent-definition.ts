import type { AgentType, AgentToolName, ArtifactKind, AgentPermissionMode } from './agent-types.js';

export interface AgentDefinition {
  type: AgentType;
  description: string;
  allowedTools: AgentToolName[];
  inputKinds: ArtifactKind[];
  outputKinds: ArtifactKind[];
  permissionMode: AgentPermissionMode;
  maxIterations?: number;
  canRunInBackground?: boolean;
}
