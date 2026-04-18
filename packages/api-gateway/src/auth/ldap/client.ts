/**
 * LDAP client — thin wrapper around `ldapjs`.
 *
 * Kept dynamic-import only so the rest of the gateway compiles without
 * `ldapjs` installed. Operators who don't use LDAP never touch this path.
 *
 * Flow implemented here:
 *   1. bind as admin
 *   2. search for user by search_filter substituted with `%s` = login
 *   3. read user attributes
 *   4. re-bind as user DN with supplied password (this IS the authentication)
 *   5. return normalized record
 *
 * This mirrors `pkg/services/ldap/client.go` conceptually — no copied code.
 */

import type { LdapServerConfig } from './config.js';
import { AuthError } from '@agentic-obs/common';

export interface LdapLookupInput {
  login: string;
  password: string;
}

export interface LdapUserRecord {
  dn: string;
  username: string;
  email: string;
  name: string;
  groupDns: string[];
}

type LdapJsClient = {
  bind: (dn: string, pw: string, cb: (err: Error | null) => void) => void;
  search: (
    base: string,
    opts: Record<string, unknown>,
    cb: (err: Error | null, res: LdapSearchResponse) => void,
  ) => void;
  unbind: (cb: (err?: Error | null) => void) => void;
};
type LdapSearchResponse = {
  on: (
    event: 'searchEntry' | 'error' | 'end',
    cb: (arg?: unknown) => void,
  ) => void;
};

async function dynamicImport(name: string): Promise<unknown> {
  // Indirect through a variable so tsc doesn't try to resolve the literal
  // module at compile time. `ldapjs` is an optional peer dep; operators who
  // don't use LDAP shouldn't need to install it.
  const nm = name;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return (new Function('m', 'return import(m)')(nm) as Promise<unknown>);
}

async function connect(cfg: LdapServerConfig): Promise<LdapJsClient> {
  let ldap: { createClient: (opts: Record<string, unknown>) => LdapJsClient };
  try {
    ldap = (await dynamicImport('ldapjs')) as {
      createClient: (opts: Record<string, unknown>) => LdapJsClient;
    };
  } catch {
    throw AuthError.providerNotConfigured('ldap');
  }
  const url = `${cfg.useSsl ? 'ldaps' : 'ldap'}://${cfg.host}:${cfg.port}`;
  return ldap.createClient({ url });
}

function promisifyBind(
  client: LdapJsClient,
  dn: string,
  pw: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    client.bind(dn, pw, (err) => (err ? reject(err) : resolve()));
  });
}

function promisifyUnbind(client: LdapJsClient): Promise<void> {
  return new Promise((resolve) => {
    client.unbind(() => resolve());
  });
}

function promisifySearch(
  client: LdapJsClient,
  base: string,
  opts: Record<string, unknown>,
): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    client.search(base, opts, (err, res) => {
      if (err) return reject(err);
      const entries: Array<Record<string, unknown>> = [];
      res.on('searchEntry', (entry: unknown) => {
        const e = entry as { object?: Record<string, unknown> };
        if (e.object) entries.push(e.object);
      });
      res.on('error', (e: unknown) => reject(e as Error));
      res.on('end', () => resolve(entries));
    });
  });
}

function extractString(
  obj: Record<string, unknown>,
  key: string,
): string | null {
  const v = obj[key];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
  return null;
}

function extractList(obj: Record<string, unknown>, key: string): string[] {
  const v = obj[key];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

export async function authenticate(
  cfg: LdapServerConfig,
  input: LdapLookupInput,
): Promise<LdapUserRecord | null> {
  const client = await connect(cfg);
  try {
    // 1. admin bind
    await promisifyBind(client, cfg.bindDn, cfg.bindPassword);

    // 2. search
    const filter = cfg.searchFilter.replace(/%s/g, input.login);
    let entry: Record<string, unknown> | null = null;
    for (const base of cfg.searchBaseDns) {
      const results = await promisifySearch(client, base, {
        filter,
        scope: 'sub',
        attributes: [
          'dn',
          cfg.attributes.username,
          cfg.attributes.email,
          cfg.attributes.name,
          cfg.attributes.memberOf,
        ],
      });
      if (results.length > 0) {
        entry = results[0]!;
        break;
      }
    }
    if (!entry) return null;
    const dn = extractString(entry, 'dn');
    if (!dn) return null;

    // 3/4. rebind as user
    try {
      await promisifyBind(client, dn, input.password);
    } catch {
      return null;
    }

    return {
      dn,
      username: extractString(entry, cfg.attributes.username) ?? input.login,
      email: extractString(entry, cfg.attributes.email) ?? '',
      name: extractString(entry, cfg.attributes.name) ?? input.login,
      groupDns: extractList(entry, cfg.attributes.memberOf),
    };
  } finally {
    await promisifyUnbind(client);
  }
}
