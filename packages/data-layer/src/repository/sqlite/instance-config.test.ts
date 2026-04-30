import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import type { SqliteClient } from '../../db/sqlite-client.js';
import { createTestDb } from '../../test-support/test-db.js';
import { InstanceConfigRepository } from './instance-config.js';
import { DatasourceRepository } from './datasource.js';
import { NotificationChannelRepository } from './notification-channel.js';

function seedExtraOrg(db: SqliteClient, id: string): void {
  db.run(sql`
    INSERT INTO org (id, name, created, updated)
    VALUES (${id}, ${id}, datetime('now'), datetime('now'))
  `);
}

describe('instance-config repositories', () => {
  const prevSecret = process.env['SECRET_KEY'];

  beforeAll(() => {
    // AES-GCM needs a ≥32-char key; tests supply one if operator didn't.
    process.env['SECRET_KEY'] =
      prevSecret ?? 'test-secret-key-for-instance-config-repositories-xxxxxxxx';
  });

  afterAll(() => {
    if (prevSecret === undefined) delete process.env['SECRET_KEY'];
    else process.env['SECRET_KEY'] = prevSecret;
  });

  let db: SqliteClient;

  beforeEach(() => {
    db = createTestDb();
  });

  describe('InstanceConfigRepository', () => {
    it('getLlm() returns null on a fresh DB', async () => {
      const repo = new InstanceConfigRepository(db);
      expect(await repo.getLlm()).toBeNull();
    });

    it('setLlm() then getLlm() round-trips plaintext api key', async () => {
      const repo = new InstanceConfigRepository(db);
      await repo.setLlm({
        provider: 'anthropic',
        apiKey: 'sk-ant-secret-1234567890',
        model: 'claude-3-opus',
      });
      const cfg = await repo.getLlm();
      expect(cfg).not.toBeNull();
      expect(cfg!.provider).toBe('anthropic');
      expect(cfg!.apiKey).toBe('sk-ant-secret-1234567890');
      expect(cfg!.model).toBe('claude-3-opus');
    });

    it('getLlm({ masked: true }) redacts the api key', async () => {
      const repo = new InstanceConfigRepository(db);
      await repo.setLlm({
        provider: 'openai',
        apiKey: 'sk-openai-live-abcd1234',
        model: 'gpt-4',
      });
      const masked = await repo.getLlm({ masked: true });
      expect(masked!.apiKey).toBe('••••••1234');
    });

    it('setLlm() is idempotent and overwrites on second call', async () => {
      const repo = new InstanceConfigRepository(db);
      await repo.setLlm({ provider: 'anthropic', apiKey: 'k1', model: 'm1' });
      await repo.setLlm({ provider: 'openai', apiKey: 'k2', model: 'm2' });
      const cfg = await repo.getLlm();
      expect(cfg!.provider).toBe('openai');
      expect(cfg!.apiKey).toBe('k2');
    });

    it('ciphertext on disk does not contain plaintext api key', async () => {
      const repo = new InstanceConfigRepository(db);
      const secret = 'super-secret-api-key-plaintext-do-not-leak';
      await repo.setLlm({ provider: 'anthropic', apiKey: secret, model: 'm' });
      // Peek at the raw row
      const row = await import('drizzle-orm').then(({ sql }) =>
        db.all<{ api_key: string }>(sql`SELECT api_key FROM instance_llm_config`),
      );
      expect(row[0]!.api_key).not.toContain(secret);
    });

    it('getSetting/setSetting round-trip', async () => {
      const repo = new InstanceConfigRepository(db);
      expect(await repo.getSetting('bootstrapped_at')).toBeNull();
      await repo.setSetting('bootstrapped_at', '2026-04-18T12:00:00Z');
      expect(await repo.getSetting('bootstrapped_at')).toBe('2026-04-18T12:00:00Z');
      await repo.setSetting('bootstrapped_at', '2026-04-18T13:00:00Z');
      expect(await repo.getSetting('bootstrapped_at')).toBe('2026-04-18T13:00:00Z');
    });
  });

  describe('DatasourceRepository', () => {
    it('list() returns [] on empty DB', async () => {
      const repo = new DatasourceRepository(db);
      expect(await repo.list({ orgId: 'org_main' })).toEqual([]);
    });

    it('create/get/list round-trip with encrypted password', async () => {
      const repo = new DatasourceRepository(db);
      const ds = await repo.create({
        orgId: 'org_main',
        type: 'prometheus',
        name: 'prod-prom',
        url: 'https://prom.example.com',
        username: 'admin',
        password: 'hunter2',
      });
      expect(ds.name).toBe('prod-prom');
      expect(ds.password).toBe('hunter2');
      const fetched = await repo.get(ds.id, { orgId: 'org_main' });
      expect(fetched!.password).toBe('hunter2');
      const all = await repo.list({ orgId: 'org_main' });
      expect(all).toHaveLength(1);
    });

    it('get({ masked: true }) redacts apiKey and password', async () => {
      const repo = new DatasourceRepository(db);
      const ds = await repo.create({
        orgId: 'org_main',
        type: 'elasticsearch',
        name: 'logs',
        url: 'https://es.example.com',
        apiKey: 'es-api-key-plaintext-abcd1234',
        password: 'short',
      });
      const masked = await repo.get(ds.id, { orgId: 'org_main', masked: true });
      expect(masked!.apiKey).toBe('••••••1234');
      // Password "short" is >4 chars so the mask also includes the suffix.
      expect(masked!.password).toBe('••••••hort');
    });

    it('update() changes only patched fields, re-encrypts secrets', async () => {
      const repo = new DatasourceRepository(db);
      const ds = await repo.create({
        orgId: 'org_main',
        type: 'prometheus',
        name: 'a',
        url: 'https://a.example.com',
        apiKey: 'old-key',
      });
      const updated = await repo.update(
        ds.id,
        { apiKey: 'new-key', name: 'a-renamed' },
        'org_main',
      );
      expect(updated!.apiKey).toBe('new-key');
      expect(updated!.name).toBe('a-renamed');
      expect(updated!.url).toBe('https://a.example.com');
    });

    it('delete() removes the row', async () => {
      const repo = new DatasourceRepository(db);
      const ds = await repo.create({ orgId: 'org_main', type: 'prometheus', name: 'tmp', url: 'u' });
      expect(await repo.delete(ds.id, 'org_main')).toBe(true);
      expect(await repo.get(ds.id, { orgId: 'org_main' })).toBeNull();
      expect(await repo.delete(ds.id, 'org_main')).toBe(false);
    });

    it('unique (org_id, name) is enforced per-org but allows the same name across orgs', async () => {
      seedExtraOrg(db, 'org_other');
      const repo = new DatasourceRepository(db);
      await repo.create({ type: 'prometheus', name: 'shared', url: 'u1', orgId: 'org_main' });
      // Same name in a different org is fine.
      await repo.create({ type: 'prometheus', name: 'shared', url: 'u2', orgId: 'org_other' });
      // Repeat within the same org collides.
      await expect(
        repo.create({ type: 'prometheus', name: 'shared', url: 'u3', orgId: 'org_main' }),
      ).rejects.toThrow();
    });

    it('count() with org filter', async () => {
      seedExtraOrg(db, 'org_other');
      const repo = new DatasourceRepository(db);
      await repo.create({ type: 'prometheus', name: 'a', url: 'u', orgId: 'org_main' });
      await repo.create({ type: 'prometheus', name: 'b', url: 'u', orgId: 'org_other' });
      expect(await repo.count('org_main')).toBe(1);
      expect(await repo.count('org_other')).toBe(1);
    });

    it('create() keeps only one default per org and type', async () => {
      const repo = new DatasourceRepository(db);
      const first = await repo.create({
        orgId: 'org_main',
        type: 'prometheus',
        name: 'prom-a',
        url: 'u1',
        isDefault: true,
      });
      const second = await repo.create({
        orgId: 'org_main',
        type: 'prometheus',
        name: 'prom-b',
        url: 'u2',
        isDefault: true,
      });

      expect((await repo.get(first.id, { orgId: 'org_main' }))!.isDefault).toBe(false);
      expect((await repo.get(second.id, { orgId: 'org_main' }))!.isDefault).toBe(true);
      const defaults = (await repo.list({ orgId: 'org_main', type: 'prometheus' })).filter(
        (ds) => ds.isDefault,
      );
      expect(defaults).toHaveLength(1);
    });

    it('update() promotes one default without affecting other types or orgs', async () => {
      seedExtraOrg(db, 'org_other');
      const repo = new DatasourceRepository(db);
      const promA = await repo.create({
        orgId: 'org_main',
        type: 'prometheus',
        name: 'prom-a',
        url: 'u1',
        isDefault: true,
      });
      const promB = await repo.create({
        orgId: 'org_main',
        type: 'prometheus',
        name: 'prom-b',
        url: 'u2',
      });
      const logs = await repo.create({
        orgId: 'org_main',
        type: 'elasticsearch',
        name: 'logs',
        url: 'u3',
        isDefault: true,
      });
      const otherOrg = await repo.create({
        orgId: 'org_other',
        type: 'prometheus',
        name: 'prom-other',
        url: 'u4',
        isDefault: true,
      });

      await repo.update(promB.id, { isDefault: true }, 'org_main');

      expect((await repo.get(promA.id, { orgId: 'org_main' }))!.isDefault).toBe(false);
      expect((await repo.get(promB.id, { orgId: 'org_main' }))!.isDefault).toBe(true);
      expect((await repo.get(logs.id, { orgId: 'org_main' }))!.isDefault).toBe(true);
      expect((await repo.get(otherOrg.id, { orgId: 'org_other' }))!.isDefault).toBe(true);
    });

    it('enforces org scope on list/get/update/delete/count', async () => {
      seedExtraOrg(db, 'org_other');
      const repo = new DatasourceRepository(db);
      const main = await repo.create({
        id: 'prom-main',
        type: 'prometheus',
        name: 'main',
        url: 'u1',
        orgId: 'org_main',
      });
      const other = await repo.create({
        id: 'prom-other',
        type: 'prometheus',
        name: 'other',
        url: 'u2',
        orgId: 'org_other',
      });

      expect((await repo.list({ orgId: 'org_main' })).map((d) => d.id)).toEqual([main.id]);
      expect(await repo.get(other.id, { orgId: 'org_main' })).toBeNull();
      expect(await repo.update(other.id, { name: 'leak' }, 'org_main')).toBeNull();
      expect((await repo.get(other.id, { orgId: 'org_other' }))!.name).toBe('other');
      expect(await repo.delete(other.id, 'org_main')).toBe(false);
      expect(await repo.get(other.id, { orgId: 'org_other' })).not.toBeNull();
      expect(await repo.count('org_main')).toBe(1);
    });
  });

  describe('NotificationChannelRepository', () => {
    it('create/get round-trip with encrypted slack webhook', async () => {
      const repo = new NotificationChannelRepository(db);
      const ch = await repo.create({
        type: 'slack',
        name: 'ops',
        config: { kind: 'slack', webhookUrl: 'https://hooks.slack.com/services/T/B/XYZ' },
      });
      expect(ch.type).toBe('slack');
      const got = await repo.get(ch.id);
      expect(got!.config).toEqual({
        kind: 'slack',
        webhookUrl: 'https://hooks.slack.com/services/T/B/XYZ',
      });
    });

    it('email config encrypts only password, keeps host/port/from plaintext', async () => {
      const repo = new NotificationChannelRepository(db);
      const ch = await repo.create({
        type: 'email',
        name: 'ops-email',
        config: {
          kind: 'email',
          host: 'smtp.example.com',
          port: 587,
          username: 'bot',
          password: 'smtp-secret-plain',
          from: 'alerts@example.com',
        },
      });
      // Raw row: host and password should both be in the JSON blob, but
      // password as ciphertext, not plaintext.
      const row = await import('drizzle-orm').then(({ sql }) =>
        db.all<{ config: string }>(sql`SELECT config FROM notification_channels WHERE id = ${ch.id}`),
      );
      expect(row[0]!.config).toContain('smtp.example.com');
      expect(row[0]!.config).not.toContain('smtp-secret-plain');
      // Readback decrypts.
      const got = await repo.get(ch.id);
      expect(got!.config).toEqual({
        kind: 'email',
        host: 'smtp.example.com',
        port: 587,
        username: 'bot',
        password: 'smtp-secret-plain',
        from: 'alerts@example.com',
      });
    });

    it('list() filters by type', async () => {
      const repo = new NotificationChannelRepository(db);
      await repo.create({
        type: 'slack',
        name: 's1',
        config: { kind: 'slack', webhookUrl: 'https://a' },
      });
      await repo.create({
        type: 'pagerduty',
        name: 'p1',
        config: { kind: 'pagerduty', integrationKey: 'pd-key' },
      });
      expect((await repo.list({ type: 'slack' })).map((c) => c.name)).toEqual(['s1']);
    });

    it('delete() removes the row', async () => {
      const repo = new NotificationChannelRepository(db);
      const ch = await repo.create({
        type: 'slack',
        name: 'tmp',
        config: { kind: 'slack', webhookUrl: 'https://x' },
      });
      expect(await repo.delete(ch.id)).toBe(true);
      expect(await repo.get(ch.id)).toBeNull();
    });
  });
});
