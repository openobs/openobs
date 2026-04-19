// JSON file persistence for all in-memory stores
// Like Grafana's default SQLite - zero-config, data survives restarts

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createLogger } from '@agentic-obs/common/logging';
import { dataDir, legacyStoresPath } from './paths.js';

const log = createLogger('persistence');

// Resolved lazily so tests can override DATA_DIR before the first read.
function storeFile(): string { return legacyStoresPath(); }
function storeDir(): string { return dataDir(); }

export interface Persistable {
  toJSON(): unknown;
  loadJSON(data: unknown): void;
}

const registry = new Map<string, Persistable>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

export function registerStore(name: string, store: Persistable): void {
  registry.set(name, store);
}

export async function loadAll(): Promise<void> {
  try {
    const raw = await readFile(storeFile(), 'utf-8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    for (const [name, store] of registry) {
      if (data[name] !== undefined) {
        try {
          store.loadJSON(data[name]);
        } catch (err) {
          log.error({ err, store: name }, 'failed to load store');
        }
      }
    }

    log.info({ storeCount: registry.size, file: storeFile() }, 'loaded stores');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      log.info('no saved data found - starting fresh');
    } else {
      log.error({ err }, 'failed to read store file');
    }
  }
}

async function flush(): Promise<void> {
  if (!dirty)
    return;
  dirty = false;

  const snapshot: Record<string, unknown> = {};
  for (const [name, store] of registry)
    snapshot[name] = store.toJSON();

  try {
    await mkdir(storeDir(), { recursive: true });
    // Write to temp file first, then rename for atomicity
    const tmpFile = `${storeFile()}.tmp`;
    await writeFile(tmpFile, JSON.stringify(snapshot, null, 2), 'utf-8');
    await (await import('node:fs/promises')).rename(tmpFile, storeFile());
  } catch (err) {
    log.error({ err }, 'failed to write store file');
  }
}

export function markDirty(): void {
  dirty = true;
  if (flushTimer)
    return;
  // Debounce: write at most every 2 seconds
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush().catch((err) => {
      log.error({ err }, 'async flush failed');
    });
  }, 2000);
}

export async function flushStores(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  dirty = true; // Force final flush
  await flush();
  log.info('final flush complete');
}
