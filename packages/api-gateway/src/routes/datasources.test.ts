import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type {
  Evaluator,
  Identity,
  InstanceDatasource,
  NewInstanceDatasource,
  InstanceDatasourcePatch,
} from '@agentic-obs/common';
import { createDatasourcesRouter } from './datasources.js';
import type { SetupConfigService } from '../services/setup-config-service.js';
import type { AccessControlSurface } from '../services/accesscontrol-holder.js';
import { testDatasourceConnection } from '../utils/datasource.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

vi.mock('../utils/datasource.js', () => ({
  testDatasourceConnection: vi.fn(async () => ({ ok: true })),
}));

function identity(orgId: string): Identity {
  return {
    userId: 'user_1',
    orgId,
    orgRole: 'Admin',
    isServerAdmin: false,
    authenticatedBy: 'session',
  };
}

function makeDatasource(
  id: string,
  orgId: string,
  patch: Partial<InstanceDatasource> = {},
): InstanceDatasource {
  return {
    id,
    orgId,
    type: 'prometheus',
    name: id,
    url: `http://${id}.example`,
    isDefault: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

function appWith(orgId: string, seed: InstanceDatasource[] = []) {
  const rows = new Map(seed.map((ds) => [ds.id, { ...ds }]));
  const setupConfig = {
    listDatasources: vi.fn(async (opts: { orgId: string }) =>
      [...rows.values()].filter((ds) => ds.orgId === opts.orgId),
    ),
    getDatasource: vi.fn(async (id: string, opts: { orgId: string }) => {
      const ds = rows.get(id);
      return ds && ds.orgId === opts.orgId ? { ...ds } : null;
    }),
    createDatasource: vi.fn(async (input: NewInstanceDatasource) => {
      const ds = makeDatasource(input.id ?? `${input.type}-new`, input.orgId, input);
      rows.set(ds.id, ds);
      return { ...ds };
    }),
    updateDatasource: vi.fn(async (
      id: string,
      patch: InstanceDatasourcePatch,
      actor: { orgId: string },
    ) => {
      const existing = rows.get(id);
      if (!existing || existing.orgId !== actor.orgId) return null;
      const updated = { ...existing, ...patch };
      rows.set(id, updated);
      return { ...updated };
    }),
    deleteDatasource: vi.fn(async (id: string, actor: { orgId: string }) => {
      const existing = rows.get(id);
      if (!existing || existing.orgId !== actor.orgId) return false;
      rows.delete(id);
      return true;
    }),
  };
  const accessControl: AccessControlSurface = {
    getUserPermissions: async () => [],
    ensurePermissions: async () => [],
    filterByPermission: async (_identity, items) => [...items],
    evaluate: async (_identity: Identity, _evaluator: Evaluator) => true,
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as AuthenticatedRequest).auth = identity(orgId);
    next();
  });
  app.use('/api/datasources', createDatasourcesRouter({
    setupConfig: setupConfig as unknown as SetupConfigService,
    ac: accessControl,
  }));
  return { app, rows, setupConfig };
}

describe('/api/datasources org scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists only the current org and ignores body.orgId on create', async () => {
    const { app, rows } = appWith('org_a', [
      makeDatasource('prom-a', 'org_a'),
      makeDatasource('prom-b', 'org_b'),
    ]);

    const list = await request(app).get('/api/datasources');
    expect(list.status).toBe(200);
    expect(list.body.datasources.map((ds: InstanceDatasource) => ds.id)).toEqual(['prom-a']);

    const created = await request(app)
      .post('/api/datasources')
      .send({
        id: 'prom-created',
        orgId: 'org_b',
        type: 'prometheus',
        name: 'created',
        url: 'http://created.example',
      });
    expect(created.status).toBe(201);
    expect(created.body.datasource.orgId).toBe('org_a');
    expect(rows.get('prom-created')?.orgId).toBe('org_a');
  });

  it('does not get, update, delete, or test a datasource in another org', async () => {
    const foreign = makeDatasource('prom-b', 'org_b', { name: 'foreign' });
    const { app, rows } = appWith('org_a', [
      makeDatasource('prom-a', 'org_a'),
      foreign,
    ]);

    await expect(request(app).get('/api/datasources/prom-b')).resolves.toMatchObject({ status: 404 });
    await expect(
      request(app).put('/api/datasources/prom-b').send({ name: 'leak' }),
    ).resolves.toMatchObject({ status: 404 });
    expect(rows.get('prom-b')?.name).toBe('foreign');

    await expect(request(app).post('/api/datasources/prom-b/test')).resolves.toMatchObject({ status: 404 });
    expect(testDatasourceConnection).not.toHaveBeenCalled();

    await expect(request(app).delete('/api/datasources/prom-b')).resolves.toMatchObject({ status: 404 });
    expect(rows.get('prom-b')).toEqual(foreign);
  });
});
