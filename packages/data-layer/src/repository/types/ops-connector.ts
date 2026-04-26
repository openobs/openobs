export type OpsConnectorType = 'kubernetes';

export type OpsConnectorStatus = 'unknown' | 'connected' | 'degraded' | 'error';

export interface OpsConnectorConfig {
  clusterName?: string;
  apiServer?: string;
  context?: string;
  [key: string]: unknown;
}

export interface OpsConnector {
  id: string;
  orgId: string;
  type: OpsConnectorType;
  name: string;
  environment: string | null;
  config: OpsConnectorConfig;
  secretRef: string | null;
  secret: string | null;
  allowedNamespaces: string[];
  capabilities: string[];
  status: OpsConnectorStatus;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewOpsConnector {
  id?: string;
  orgId: string;
  type?: OpsConnectorType;
  name: string;
  environment?: string | null;
  config?: OpsConnectorConfig;
  secretRef?: string | null;
  secret?: string | null;
  allowedNamespaces?: string[];
  capabilities?: string[];
  status?: OpsConnectorStatus;
  lastCheckedAt?: string | null;
}

export interface OpsConnectorPatch {
  name?: string;
  environment?: string | null;
  config?: OpsConnectorConfig;
  secretRef?: string | null;
  secret?: string | null;
  allowedNamespaces?: string[];
  capabilities?: string[];
  status?: OpsConnectorStatus;
  lastCheckedAt?: string | null;
}

export interface OpsConnectorReadOptions {
  masked?: boolean;
}

export interface IOpsConnectorRepository {
  listByOrg(orgId: string, opts?: OpsConnectorReadOptions): Promise<OpsConnector[]>;
  findByIdInOrg(
    orgId: string,
    id: string,
    opts?: OpsConnectorReadOptions,
  ): Promise<OpsConnector | null>;
  create(input: NewOpsConnector): Promise<OpsConnector>;
  update(
    orgId: string,
    id: string,
    patch: OpsConnectorPatch,
  ): Promise<OpsConnector | null>;
  delete(orgId: string, id: string): Promise<boolean>;
}
