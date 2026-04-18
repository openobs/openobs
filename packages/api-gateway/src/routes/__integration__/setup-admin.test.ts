/**
 * POST /api/setup/admin integration tests (T9.4 — first-admin bootstrap).
 *
 * Shape:
 *   - empty DB: creates user with is_admin=1, seeds org_user Admin, returns
 *     { userId, orgId } and issues a session cookie.
 *   - once a user exists: 409.
 *   - validation: 400 on bad email / missing name / short password.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express, { type Application } from 'express';
import request from 'supertest';
import {
  AuditLogRepository,
  OrgRepository,
  OrgUserRepository,
  UserAuthTokenRepository,
  UserRepository,
  createTestDb,
  seedDefaultOrg,
} from '@agentic-obs/data-layer';
import type { SqliteClient } from '@agentic-obs/data-layer';
import {
  createSetupRouter,
  setBootstrapHasUsers,
  setSetupAdminDeps,
} from '../setup.js';
import { AuditWriter } from '../../auth/audit-writer.js';
import { SessionService } from '../../auth/session-service.js';

interface Ctx {
  app: Application;
  db: SqliteClient;
  users: UserRepository;
  orgUsers: OrgUserRepository;
}

async function buildApp(): Promise<Ctx> {
  const db = createTestDb();
  await seedDefaultOrg(db);

  const users = new UserRepository(db);
  const orgUsers = new OrgUserRepository(db);
  const orgs = new OrgRepository(db);
  const userAuthTokens = new UserAuthTokenRepository(db);
  const auditLog = new AuditLogRepository(db);
  const audit = new AuditWriter(auditLog);
  const sessions = new SessionService(userAuthTokens);

  setBootstrapHasUsers(async () => {
    const { total } = await users.list({ limit: 1 });
    return total > 0;
  });
  setSetupAdminDeps({
    users,
    orgs,
    orgUsers,
    sessions,
    audit,
    defaultOrgId: 'org_main',
  });

  const app = express();
  app.use(express.json());
  app.use('/api/setup', createSetupRouter());
  return { app, db, users, orgUsers };
}

describe('POST /api/setup/admin', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await buildApp();
  });

  it('creates the first admin and returns 201 + Set-Cookie', async () => {
    const res = await request(ctx.app)
      .post('/api/setup/admin')
      .send({
        email: 'owner@example.com',
        name: 'Owner',
        login: 'owner',
        password: 'longenoughpassword',
      });
    expect(res.status).toBe(201);
    expect(res.body.userId).toBeTruthy();
    expect(res.body.orgId).toBe('org_main');
    // Session cookie should be set.
    const cookies = res.headers['set-cookie'];
    const cookieHeaders = Array.isArray(cookies) ? cookies : [cookies];
    expect(cookieHeaders.some((c) => c?.startsWith('openobs_session='))).toBe(true);

    // User row has is_admin=1 and org_user Admin role.
    const user = await ctx.users.findByEmail('owner@example.com');
    expect(user?.isAdmin).toBe(true);
    const membership = await ctx.orgUsers.findMembership('org_main', user!.id);
    expect(membership?.role).toBe('Admin');
  });

  it('409 once any user already exists', async () => {
    await request(ctx.app)
      .post('/api/setup/admin')
      .send({
        email: 'first@example.com',
        name: 'First',
        password: 'longenoughpassword',
      });
    const res = await request(ctx.app)
      .post('/api/setup/admin')
      .send({
        email: 'second@example.com',
        name: 'Second',
        password: 'longenoughpassword',
      });
    expect(res.status).toBe(409);
  });

  it('400 on invalid email', async () => {
    const res = await request(ctx.app)
      .post('/api/setup/admin')
      .send({
        email: 'not-an-email',
        name: 'X',
        password: 'longenoughpassword',
      });
    expect(res.status).toBe(400);
  });

  it('400 on missing name', async () => {
    const res = await request(ctx.app)
      .post('/api/setup/admin')
      .send({
        email: 'x@example.com',
        password: 'longenoughpassword',
      });
    expect(res.status).toBe(400);
  });

  it('400 on short password', async () => {
    const res = await request(ctx.app)
      .post('/api/setup/admin')
      .send({
        email: 'x@example.com',
        name: 'X',
        password: 'short',
      });
    expect(res.status).toBe(400);
  });

  it('autofills login from email local-part when login is omitted', async () => {
    const res = await request(ctx.app)
      .post('/api/setup/admin')
      .send({
        email: 'jane@example.com',
        name: 'Jane',
        password: 'longenoughpassword',
      });
    expect(res.status).toBe(201);
    const user = await ctx.users.findByEmail('jane@example.com');
    expect(user?.login).toBe('jane');
  });
});

describe('GET /api/setup/status', () => {
  it('returns hasAdmin=false on a fresh DB', async () => {
    const { app } = await buildApp();
    const res = await request(app).get('/api/setup/status');
    expect(res.status).toBe(200);
    expect(res.body.hasAdmin).toBe(false);
  });

  it('returns hasAdmin=true once an admin is created', async () => {
    const { app } = await buildApp();
    await request(app)
      .post('/api/setup/admin')
      .send({
        email: 'y@example.com',
        name: 'Y',
        password: 'longenoughpassword',
      });
    const res = await request(app).get('/api/setup/status');
    expect(res.body.hasAdmin).toBe(true);
  });
});
