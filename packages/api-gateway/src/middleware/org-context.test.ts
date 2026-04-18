import { describe, it, expect, beforeEach } from 'vitest';
import {
  OrgUserRepository,
  UserRepository,
  createTestDb,
} from '@agentic-obs/data-layer';
import {
  createOrgContextMiddleware,
  ORG_HEADER,
} from './org-context.js';
import type { AuthenticatedRequest } from './auth.js';

function mockRes() {
  let status = 200;
  let body: unknown = undefined;
  const res = {
    status(c: number) {
      status = c;
      return res;
    },
    json(b: unknown) {
      body = b;
      return res;
    },
    get _status() {
      return status;
    },
    get _body() {
      return body;
    },
  };
  return res as unknown as import('express').Response & {
    _status: number;
    _body: unknown;
  };
}

describe('orgContextMiddleware', () => {
  let db: ReturnType<typeof createTestDb>;
  let users: UserRepository;
  let orgUsers: OrgUserRepository;
  let mw: ReturnType<typeof createOrgContextMiddleware>;

  beforeEach(() => {
    db = createTestDb();
    users = new UserRepository(db);
    orgUsers = new OrgUserRepository(db);
    mw = createOrgContextMiddleware({ orgUsers });
  });

  it('returns 401 without req.auth', async () => {
    const req = { headers: {}, query: {} } as unknown as AuthenticatedRequest;
    const res = mockRes();
    await mw(req, res, () => null);
    expect(res._status).toBe(401);
  });

  it('populates orgRole from membership for default org', async () => {
    const user = await users.create({
      email: 'a@x.com',
      login: 'alice',
      name: 'A',
      orgId: 'org_main',
    });
    await orgUsers.create({ orgId: 'org_main', userId: user.id, role: 'Viewer' });
    const req = {
      headers: {},
      query: {},
      auth: {
        userId: user.id,
        orgId: 'org_main',
        orgRole: 'None',
        isServerAdmin: false,
        authenticatedBy: 'session',
      },
    } as unknown as AuthenticatedRequest;
    const res = mockRes();
    let called = false;
    await mw(req, res, () => {
      called = true;
    });
    expect(called).toBe(true);
    expect(req.auth?.orgRole).toBe('Viewer');
  });

  it('honours the X-Openobs-Org-Id header when user is a member', async () => {
    const user = await users.create({
      email: 'a@x.com',
      login: 'alice',
      name: 'A',
      orgId: 'org_main',
    });
    await orgUsers.create({ orgId: 'org_main', userId: user.id, role: 'Viewer' });
    const req = {
      headers: { [ORG_HEADER]: 'org_main' },
      query: {},
      auth: {
        userId: user.id,
        orgId: 'org_main',
        orgRole: 'None',
        isServerAdmin: false,
        authenticatedBy: 'session',
      },
    } as unknown as AuthenticatedRequest;
    const res = mockRes();
    await mw(req, res, () => null);
    expect(req.auth?.orgId).toBe('org_main');
  });

  it('403 when user not a member of requested org', async () => {
    const user = await users.create({
      email: 'a@x.com',
      login: 'alice',
      name: 'A',
      orgId: 'org_main',
    });
    const req = {
      headers: { [ORG_HEADER]: 'org_other' },
      query: {},
      auth: {
        userId: user.id,
        orgId: 'org_main',
        orgRole: 'None',
        isServerAdmin: false,
        authenticatedBy: 'session',
      },
    } as unknown as AuthenticatedRequest;
    const res = mockRes();
    await mw(req, res, () => null);
    expect(res._status).toBe(403);
  });

  it('server admin without membership passes through with None role', async () => {
    const user = await users.create({
      email: 'admin@x.com',
      login: 'admin',
      name: 'Admin',
      orgId: 'org_main',
      isAdmin: true,
    });
    const req = {
      headers: {},
      query: {},
      auth: {
        userId: user.id,
        orgId: 'org_main',
        orgRole: 'None',
        isServerAdmin: true,
        authenticatedBy: 'session',
      },
    } as unknown as AuthenticatedRequest;
    const res = mockRes();
    let called = false;
    await mw(req, res, () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it('honours ?orgId=', async () => {
    const user = await users.create({
      email: 'a@x.com',
      login: 'alice',
      name: 'A',
      orgId: 'org_main',
    });
    await orgUsers.create({ orgId: 'org_main', userId: user.id, role: 'Editor' });
    const req = {
      headers: {},
      query: { orgId: 'org_main' },
      auth: {
        userId: user.id,
        orgId: 'org_main',
        orgRole: 'None',
        isServerAdmin: false,
        authenticatedBy: 'session',
      },
    } as unknown as AuthenticatedRequest;
    const res = mockRes();
    await mw(req, res, () => null);
    expect(req.auth?.orgRole).toBe('Editor');
  });
});
