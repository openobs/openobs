// Persistence primitives for in-memory stores.
// Mirrors the original api-gateway persistence interface so stores
// can be used standalone or registered with the gateway persistence layer.

export interface Persistable {
  toJSON(): unknown;
  loadJSON(data: unknown): void;
}

// -- Dirty-tracking callback --
// By default this is a no-op. The api-gateway persistence layer replaces it
// at boot time via `setMarkDirty()` so that stores can signal writes without
// depending on the gateway module directly.

let _markDirty: () => void = () => {};

/** Replace the dirty-tracking callback (called once at app startup). */
export function setMarkDirty(fn: () => void): void {
  _markDirty = fn;
}

/** Signal that in-memory state has changed and should be flushed. */
export function markDirty(): void {
  _markDirty();
}
