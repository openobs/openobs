/**
 * Postgres DatasourceRepository — integration tests.
 *
 * See `./instance-config.test.ts` for the POSTGRES_TEST_URL contract.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDbClient, type DbClient } from '../../db/client.js';
import { applyPostgresSchema } from './schema-applier.js';
import { PostgresDatasourceRepository } from './datasource.js';

const PG_URL = process.env['POSTGRES_TEST_URL'];
const describeIfPg = PG_URL ? describe : describe.skip;

async function seedExtraOrg(db: DbClient, id: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO org (id, name, created, updated)
    VALUES (${id}, ${id}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT DO NOTHING
  `);
}

describeIfPg('PostgresDatasourceRepository', () => {
  const prevSecret = process.env['SECRET_KEY'];
  let db: DbClient;

  beforeAll(async () => {
    process.env['SECRET_KEY'] =
      prevSecret ?? 'test-secret-key-for-instance-config-repositories-xxxxxxxx';
    db = createDbClient({ url: PG_URL! });
    await applyPostgresSchema(db);
  });

  afterAll(async () => {
    if (prevSecret === undefined) delete process.env['SECRET_KEY'];
    else process.env['SECRET_KEY'] = prevSecret;
    await db.$pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE instance_datasources`);
  });

  it('list() returns [] on empty DB', async () => {
    const repo = new PostgresDatasourceRepository(db);
    expect(await repo.list({ orgId: 'org_main' })).toEqual([]);
  });

  it('create/get/list round-trip with encrypted password', async () => {
    const repo = new PostgresDatasourceRepository(db);
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
    const repo = new PostgresDatasourceRepository(db);
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
    expect(masked!.password).toBe('••••••hort');
  });

  it('update() changes only patched fields', async () => {
    const repo = new PostgresDatasourceRepository(db);
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
    const repo = new PostgresDatasourceRepository(db);
    const ds = await repo.create({ orgId: 'org_main', type: 'prometheus', name: 'tmp', url: 'u' });
    expect(await repo.delete(ds.id, 'org_main')).toBe(true);
    expect(await repo.get(ds.id, { orgId: 'org_main' })).toBeNull();
    expect(await repo.delete(ds.id, 'org_main')).toBe(false);
  });

  it('count() with org filter', async () => {
    const repo = new PostgresDatasourceRepository(db);
    await seedExtraOrg(db, 'org_other');
    await repo.create({ type: 'prometheus', name: 'a', url: 'u', orgId: 'org_main' });
    await repo.create({ type: 'prometheus', name: 'b', url: 'u', orgId: 'org_other' });
    expect(await repo.count('org_main')).toBe(1);
    expect(await repo.count('org_other')).toBe(1);
  });

  it('create() keeps only one default per org and type', async () => {
    const repo = new PostgresDatasourceRepository(db);
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
    const repo = new PostgresDatasourceRepository(db);
    await seedExtraOrg(db, 'org_other');
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
    const repo = new PostgresDatasourceRepository(db);
    await seedExtraOrg(db, 'org_other');
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
