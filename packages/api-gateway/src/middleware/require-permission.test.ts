import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createTestDb,
  seedDefaultOrg,
  seedRbacForOrg,
  OrgUserRepository,
  TeamMemberRepository,
  RoleRepository,
  PermissionRepository,
  UserRoleRepository,
  TeamRoleRepository,
} from '@agentic-obs/data-layer';
import { ac, type Identity } from '@agentic-obs/common';
import { AccessControlService } from '../services/accesscontrol-service.js';
import { createRequirePermission } from './require-permission.js';

function makeApp(service: AccessControlService, identity: Identity | null) {
  const app = express();
  const requirePermission = createRequirePermission(service);

  // Inject identity via a tiny middleware before the gate.
  app.use((req, _res, next) => {
    if (identity) (req as express.Request & { auth?: Identity }).auth = identity;
    next();
  });

  app.get(
    '/protected',
    requirePermission(ac.eval('dashboards:read', 'dashboards:uid:abc')),
    (_req, res) => res.json({ ok: true }),
  );

  app.post(
    '/factory',
    requirePermission((req) => ac.eval('dashboards:write', `dashboards:uid:${req.query['uid']}`)),
    (_req, res) => res.json({ ok: true }),
  );

  return app;
}

async function buildService() {
  const db = createTestDb();
  await seedDefaultOrg(db);
  await seedRbacForOrg(db, 'org_main');
  return new AccessControlService({
    permissions: new PermissionRepository(db),
    roles: new RoleRepository(db),
    userRoles: new UserRoleRepository(db),
    teamRoles: new TeamRoleRepository(db),
    teamMembers: new TeamMemberRepository(db),
    orgUsers: new OrgUserRepository(db),
  });
}

describe('requirePermission middleware', () => {
  let service: AccessControlService;
  beforeEach(async () => {
    service = await buildService();
  });

  it('401 when no auth identity on the request', async () => {
    const app = makeApp(service, null);
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/authentication required/);
  });

  it('403 when identity lacks the required permission', async () => {
    const id: Identity = {
      userId: 'u_1',
      orgId: 'org_main',
      orgRole: 'None',
      isServerAdmin: false,
      authenticatedBy: 'session',
    };
    const app = makeApp(service, id);
    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/User has no permission to/);
    expect(res.body.message).toContain('dashboards:read');
  });

  it('200 when viewer requests a dashboard read', async () => {
    const id: Identity = {
      userId: 'u_1',
      orgId: 'org_main',
      orgRole: 'Viewer',
      isServerAdmin: false,
      authenticatedBy: 'session',
    };
    const app = makeApp(service, id);
    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
  });

  it('evaluator factory receives the request and resolves late', async () => {
    const id: Identity = {
      userId: 'u_1',
      orgId: 'org_main',
      orgRole: 'Editor',
      isServerAdmin: false,
      authenticatedBy: 'session',
    };
    const app = makeApp(service, id);
    const res = await request(app).post('/factory?uid=xyz');
    expect(res.status).toBe(200);
  });
});
