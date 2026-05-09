/**
 * Single source of truth for persistent-state paths.
 *
 * Every persistent path in the gateway flows through one of the exported
 * helpers here. Before this module, five call sites resolved the data
 * directory independently; secrets went to one dir, SQLite to another,
 * LLM config to a third, and wiping one didn't wipe the others.
 *
 * Directory layout:
 *   <DATA_DIR>/
 *     rounds.db          ← SQLite: users, orgs, dashboards, all business state
 *     rounds.db-wal / -shm
 *     secrets.json        ← JWT_SECRET + SECRET_KEY (0600, auto-generated)
 *
 * Resolution order for DATA_DIR:
 *   1. process.env.DATA_DIR  (explicit operator override)
 *   2. <cwd>/.rounds        (canonical default)
 *
 * Legacy dir-name fallbacks (`.agentic-obs`, `.uname-data`) and
 * `legacyHomeConfigPath()` / `legacyStoresPath()` were removed during the
 * tech-debt cleanup (W4 / T4.3). No shipped install consumed them;
 * operators upgrading from a pre-release snapshot rename the directory
 * manually.
 */

import { join } from 'node:path';

const CANONICAL_NAME = '.rounds';

let cached: string | undefined;

/** Absolute path of the persistent state directory. Memoized. */
export function dataDir(): string {
  if (cached) return cached;
  const override = process.env['DATA_DIR'];
  if (override) {
    cached = override;
    return cached;
  }
  cached = join(process.cwd(), CANONICAL_NAME);
  return cached;
}

export function dbPath(): string {
  return process.env['SQLITE_PATH'] ?? join(dataDir(), 'rounds.db');
}

export function secretsPath(): string {
  return join(dataDir(), 'secrets.json');
}
