/**
 * LDAP client — thin wrapper around `ldapjs`.
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
import { escapeLdapFilterValue } from './filter-escape.js';
import { AuthError } from '@agentic-obs/common';
// `ldapjs` is now a regular dependency (T9 / Wave 6 cutover). Prior to the
// cutover we dynamic-imported it so operators without LDAP didn't need the
// module installed; now that the dep is pinned in package.json the static
// import is safe.
import ldapjs from 'ldapjs';

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

async function connect(cfg: LdapServerConfig): Promise<LdapJsClient> {
  // ldapjs ships CommonJS; the default import resolves to the namespace object
  // that exposes `createClient`. Keep the narrow type ascription so we don't
  // leak `any` into the rest of the file.
  const lib = ldapjs as unknown as {
    createClient: (opts: Record<string, unknown>) => LdapJsClient;
  };
  if (typeof lib?.createClient !== 'function') {
    throw AuthError.providerNotConfigured('ldap');
  }
  const url = `${cfg.useSsl ? 'ldaps' : 'ldap'}://${cfg.host}:${cfg.port}`;
  return lib.createClient({ url });
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

    // 2. search — `input.login` is user-supplied, so escape LDAP filter
    // meta-characters (RFC 4515) before substituting it into the filter
    // template. Without this, a login like `admin)(|(uid=*` would break out
    // of the `(cn=%s)` clause and match arbitrary entries.
    const filter = cfg.searchFilter.replace(
      /%s/g,
      escapeLdapFilterValue(input.login),
    );
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
