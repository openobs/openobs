// JSON file persistence for all in-memory stores
// Like Grafana's default SQLite - zero-config, data survives restarts

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const DATA_DIR = process.env['DATA_DIR'] || join(process.cwd(), '.uname-data');
const STORE_FILE = join(DATA_DIR, 'stores.json');

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
    const raw = await readFile(STORE_FILE, 'utf-8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    for (const [name, store] of registry) {
      if (data[name] !== undefined) {
        try {
          store.loadJSON(data[name]);
        } catch (err) {
          console.error(`[persistence] Failed to load store "${name}":`, err);
        }
      }
    }

    console.log(`[persistence] Loaded ${registry.size} stores from ${STORE_FILE}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('[persistence] No saved data found - starting fresh');
    } else {
      console.error('[persistence] Failed to read store file:', err);
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
    await mkdir(DATA_DIR, { recursive: true });
    // Write to temp file first, then rename for atomicity
    const tmpFile = `${STORE_FILE}.tmp`;
    await writeFile(tmpFile, JSON.stringify(snapshot, null, 2), 'utf-8');
    await (await import('node:fs/promises')).rename(tmpFile, STORE_FILE);
  } catch (err) {
    console.error('[persistence] Failed to write store file:', err);
  }
}

export function markDirty(): void {
  dirty = true;
  if (flushTimer)
    return;
  // Debounce: write at most every 2 seconds
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 2000);
}

export async function flushStores(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  dirty = true; // Force final flush
  await flush();
  console.log('[persistence] Final flush complete');
}
