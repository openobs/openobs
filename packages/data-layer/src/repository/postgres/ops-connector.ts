import { pgAll, pgRun } from './pg-helpers.js';
import { sql } from 'drizzle-orm';
import type {
  IOpsConnectorRepository,
  NewOpsConnector,
  OpsConnector,
  OpsConnectorConfig,
  OpsConnectorPatch,
  OpsConnectorReadOptions,
  OpsConnectorStatus,
} from '../types/ops-connector.js';
import { decryptSecret, encryptSecret, maskSecret, nowIso, uid } from '../sqlite/instance-shared.js';

interface OpsConnectorRow {
  id: string;
  org_id: string;
  type: string;
  name: string;
  environment: string | null;
  config_json: string;
  secret_ref: string | null;
  encrypted_secret: string | null;
  allowed_namespaces_json: string;
  capabilities_json: string;
  status: string;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  return JSON.parse(raw) as T;
}

function rowToConnector(row: OpsConnectorRow, opts: OpsConnectorReadOptions = {}): OpsConnector {
  const secret = decryptSecret(row.encrypted_secret);
  return {
    id: row.id,
    orgId: row.org_id,
    type: 'kubernetes',
    name: row.name,
    environment: row.environment,
    config: parseJson<OpsConnectorConfig>(row.config_json, {}),
    secretRef: row.secret_ref,
    secret: opts.masked ? maskSecret(secret) : secret,
    allowedNamespaces: parseJson<string[]>(row.allowed_namespaces_json, []),
    capabilities: parseJson<string[]>(row.capabilities_json, []),
    status: row.status as OpsConnectorStatus,
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresOpsConnectorRepository implements IOpsConnectorRepository {
  constructor(private readonly db: any) {}

  async listByOrg(
    orgId: string,
    opts: OpsConnectorReadOptions = {},
  ): Promise<OpsConnector[]> {
    const rows = await pgAll<OpsConnectorRow>(this.db, sql`
      SELECT * FROM ops_connectors
      WHERE org_id = ${orgId}
      ORDER BY name
    `);
    return rows.map((row) => rowToConnector(row, opts));
  }

  async findByIdInOrg(
    orgId: string,
    id: string,
    opts: OpsConnectorReadOptions = {},
  ): Promise<OpsConnector | null> {
    const rows = await pgAll<OpsConnectorRow>(this.db, sql`
      SELECT * FROM ops_connectors
      WHERE org_id = ${orgId} AND id = ${id}
    `);
    return rows[0] ? rowToConnector(rows[0], opts) : null;
  }

  async create(input: NewOpsConnector): Promise<OpsConnector> {
    const id = input.id ?? `k8s-${uid()}`;
    const now = nowIso();
    await pgRun(this.db, sql`
      INSERT INTO ops_connectors (
        id, org_id, type, name, environment, config_json, secret_ref,
        encrypted_secret, allowed_namespaces_json, capabilities_json,
        status, last_checked_at, created_at, updated_at
      ) VALUES (
        ${id},
        ${input.orgId},
        ${input.type ?? 'kubernetes'},
        ${input.name},
        ${input.environment ?? null},
        ${JSON.stringify(input.config ?? {})},
        ${input.secretRef ?? null},
        ${encryptSecret(input.secret ?? null)},
        ${JSON.stringify(input.allowedNamespaces ?? [])},
        ${JSON.stringify(input.capabilities ?? [])},
        ${input.status ?? 'unknown'},
        ${input.lastCheckedAt ?? null},
        ${now},
        ${now}
      )
    `);
    const saved = await this.findByIdInOrg(input.orgId, id);
    if (!saved) throw new Error(`[OpsConnectorRepository] create: row ${id} not found after insert`);
    return saved;
  }

  async update(
    orgId: string,
    id: string,
    patch: OpsConnectorPatch,
  ): Promise<OpsConnector | null> {
    const existing = await this.findByIdInOrg(orgId, id);
    if (!existing) return null;

    const merged = {
      name: patch.name ?? existing.name,
      environment: patch.environment !== undefined ? patch.environment : existing.environment,
      config: patch.config ?? existing.config,
      secretRef: patch.secretRef !== undefined ? patch.secretRef : existing.secretRef,
      secret: patch.secret !== undefined ? patch.secret : existing.secret,
      allowedNamespaces: patch.allowedNamespaces ?? existing.allowedNamespaces,
      capabilities: patch.capabilities ?? existing.capabilities,
      status: patch.status ?? existing.status,
      lastCheckedAt: patch.lastCheckedAt !== undefined ? patch.lastCheckedAt : existing.lastCheckedAt,
    };

    await pgRun(this.db, sql`
      UPDATE ops_connectors SET
        name = ${merged.name},
        environment = ${merged.environment},
        config_json = ${JSON.stringify(merged.config)},
        secret_ref = ${merged.secretRef},
        encrypted_secret = ${encryptSecret(merged.secret ?? null)},
        allowed_namespaces_json = ${JSON.stringify(merged.allowedNamespaces)},
        capabilities_json = ${JSON.stringify(merged.capabilities)},
        status = ${merged.status},
        last_checked_at = ${merged.lastCheckedAt},
        updated_at = ${nowIso()}
      WHERE org_id = ${orgId} AND id = ${id}
    `);

    return this.findByIdInOrg(orgId, id);
  }

  async delete(orgId: string, id: string): Promise<boolean> {
    const existing = await this.findByIdInOrg(orgId, id);
    if (!existing) return false;
    await pgRun(this.db, sql`DELETE FROM ops_connectors WHERE org_id = ${orgId} AND id = ${id}`);
    return true;
  }
}
