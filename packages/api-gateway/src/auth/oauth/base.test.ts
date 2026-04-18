import { describe, it, expect } from 'vitest';
import {
  buildAuthorizeUrl,
  buildStateCookie,
  generateOAuthState,
  readStateCookie,
  stateCookieName,
  OAUTH_STATE_COOKIE_PREFIX,
  resolveIdentity,
  type OAuthProviderConfig,
} from './base.js';
import {
  createTestDb,
  UserAuthRepository,
  UserRepository,
} from '@agentic-obs/data-layer';

const CFG: OAuthProviderConfig = {
  module: 'oauth_github',
  displayName: 'GitHub',
  clientId: 'cid',
  clientSecret: 'csec',
  redirectUri: 'https://app.example.com/api/login/github/callback',
  scopes: ['read:user', 'user:email'],
  allowSignup: true,
};

describe('generateOAuthState / stateCookieName', () => {
  it('generates 32 hex chars of state', () => {
    const s = generateOAuthState();
    expect(s).toMatch(/^[0-9a-f]{32}$/);
  });

  it('cookie name is prefixed with module', () => {
    expect(stateCookieName('oauth_github')).toBe(
      `${OAUTH_STATE_COOKIE_PREFIX}oauth_github`,
    );
  });
});

describe('buildAuthorizeUrl', () => {
  it('contains client_id, redirect_uri, scope, state', () => {
    const url = buildAuthorizeUrl(CFG, 'STATE', 'https://idp/authorize');
    expect(url).toContain('client_id=cid');
    expect(url).toContain('state=STATE');
    expect(url).toContain('response_type=code');
    expect(url).toContain(encodeURIComponent('read:user'));
  });
});

describe('buildStateCookie / readStateCookie', () => {
  it('roundtrips', () => {
    const c = buildStateCookie('oauth_github', 'ST', true);
    const header = `${c.split(';')[0]!}; other=1`;
    expect(readStateCookie(header, 'oauth_github')).toBe('ST');
  });

  it('returns null for wrong module', () => {
    const c = buildStateCookie('oauth_github', 'ST', true);
    expect(readStateCookie(c.split(';')[0], 'oauth_google')).toBeNull();
  });

  it('includes Secure when secure=true', () => {
    const c = buildStateCookie('oauth_google', 'x', true);
    expect(c).toContain('Secure');
  });

  it('drops Secure when secure=false', () => {
    const c = buildStateCookie('oauth_google', 'x', false);
    expect(c).not.toContain('Secure');
  });
});

describe('resolveIdentity', () => {
  const SECRET = 'x'.repeat(50);

  async function deps() {
    const db = createTestDb();
    return {
      db,
      users: new UserRepository(db),
      userAuth: new UserAuthRepository(db),
      secretKey: SECRET,
      defaultOrgId: 'org_main',
    };
  }

  it('creates a new user + user_auth on first login when allow_signup', async () => {
    const d = await deps();
    const result = await resolveIdentity(
      {
        module: 'oauth_github',
        authId: '12345',
        email: 'new@x.com',
        name: 'New User',
        login: 'newguy',
      },
      { ...CFG, allowSignup: true },
      { accessToken: 'tok' },
      d,
    );
    expect(result.created).toBe(true);
    expect(result.user.login).toBe('newguy');
    const auths = await d.userAuth.listByUser(result.user.id);
    expect(auths.length).toBe(1);
    expect(auths[0]?.authModule).toBe('oauth_github');
  });

  it('throws providerNoSignup when allow_signup=false and user does not exist', async () => {
    const d = await deps();
    await expect(
      resolveIdentity(
        {
          module: 'oauth_github',
          authId: '42',
          email: 'no@x.com',
          name: 'X',
          login: 'x',
        },
        { ...CFG, allowSignup: false },
        { accessToken: 't' },
        d,
      ),
    ).rejects.toMatchObject({ kind: 'provider_no_signup' });
  });

  it('links existing user by email (auto-link)', async () => {
    const d = await deps();
    const existing = await d.users.create({
      email: 'existing@x.com',
      login: 'existing',
      name: 'E',
      orgId: 'org_main',
    });
    const result = await resolveIdentity(
      {
        module: 'oauth_github',
        authId: '999',
        email: 'existing@x.com',
        name: 'E',
      },
      { ...CFG, allowSignup: false },
      { accessToken: 't' },
      d,
    );
    expect(result.linked).toBe(true);
    expect(result.created).toBe(false);
    expect(result.user.id).toBe(existing.id);
  });

  it('finds an already-linked user_auth row', async () => {
    const d = await deps();
    const existing = await d.users.create({
      email: 'linked@x.com',
      login: 'linked',
      name: 'L',
      orgId: 'org_main',
    });
    await d.userAuth.create({
      userId: existing.id,
      authModule: 'oauth_github',
      authId: '777',
    });
    const result = await resolveIdentity(
      {
        module: 'oauth_github',
        authId: '777',
        email: 'linked@x.com',
        name: 'L',
      },
      { ...CFG, allowSignup: false },
      { accessToken: 't' },
      d,
    );
    expect(result.linked).toBe(true);
    expect(result.created).toBe(false);
    expect(result.user.id).toBe(existing.id);
  });

  it('encrypts OAuth access token at rest', async () => {
    const d = await deps();
    const result = await resolveIdentity(
      {
        module: 'oauth_github',
        authId: '1',
        email: 'e@x.com',
        name: 'E',
        login: 'e',
      },
      { ...CFG, allowSignup: true },
      { accessToken: 'plaintext-access-token' },
      d,
    );
    const auths = await d.userAuth.listByUser(result.user.id);
    const stored = auths[0]?.oAuthAccessToken ?? '';
    expect(stored).not.toBe('plaintext-access-token');
    expect(stored.split(':')).toHaveLength(3);
  });
});
