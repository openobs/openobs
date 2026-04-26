import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import type { SqliteClient } from '../../db/sqlite-client.js';
import { createTestDb } from '../../test-support/test-db.js';
import { OpsConnectorRepository } from './ops-connector.js';

describe('OpsConnectorRepository', () => {
  const prevSecret = process.env['SECRET_KEY'];
  let db: SqliteClient;
  let repo: OpsConnectorRepository;

  beforeAll(() => {
    process.env['SECRET_KEY'] =
      prevSecret ?? 'test-secret-key-for-ops-connector-repository-xxxxxxxx';
  });

  afterAll(() => {
    if (prevSecret === undefined) delete process.env['SECRET_KEY'];
    else process.env['SECRET_KEY'] = prevSecret;
  });

  beforeEach(() => {
    db = createTestDb();
    db.run(sql`INSERT INTO org (id, name, created, updated) VALUES ('org_a', 'Org A', 'now', 'now')`);
    db.run(sql`INSERT INTO org (id, name, created, updated) VALUES ('org_b', 'Org B', 'now', 'now')`);
    repo = new OpsConnectorRepository(db);
  });

  it('creates and lists connectors scoped by org', async () => {
    await repo.create({
      id: 'k8s-a',
      orgId: 'org_a',
      name: 'Prod',
      config: { apiServer: 'https://k8s-a.example.com' },
      secret: 'kubeconfig-a',
      allowedNamespaces: ['default'],
      capabilities: ['pods.read'],
    });
    await repo.create({
      id: 'k8s-b',
      orgId: 'org_b',
      name: 'Prod',
      config: { apiServer: 'https://k8s-b.example.com' },
    });

    const orgA = await repo.listByOrg('org_a', { masked: true });
    expect(orgA).toHaveLength(1);
    expect(orgA[0]!.id).toBe('k8s-a');
    expect(orgA[0]!.secret).toBe('••••••ig-a');
    expect(await repo.findByIdInOrg('org_b', 'k8s-a')).toBeNull();
  });

  it('updates and deletes by org plus id', async () => {
    await repo.create({
      id: 'k8s-a',
      orgId: 'org_a',
      name: 'Prod',
      config: { clusterName: 'prod' },
    });

    expect(await repo.update('org_b', 'k8s-a', { name: 'Nope' })).toBeNull();
    const updated = await repo.update('org_a', 'k8s-a', {
      name: 'Production',
      status: 'connected',
      lastCheckedAt: '2026-04-26T00:00:00.000Z',
    });
    expect(updated!.name).toBe('Production');
    expect(updated!.status).toBe('connected');

    expect(await repo.delete('org_b', 'k8s-a')).toBe(false);
    expect(await repo.delete('org_a', 'k8s-a')).toBe(true);
    expect(await repo.findByIdInOrg('org_a', 'k8s-a')).toBeNull();
  });
});
