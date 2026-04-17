import { PALETTE } from './palette';

/**
 * Curated "classic" series sequence, ordered for maximum perceptual distance
 * between adjacent entries. After 8 entries the sequence cycles.
 *
 * Order chosen so the first 3 colors (most common case) are clearly distinct
 * across hue, lightness, and warmth: green → blue → purple.
 */
export const CLASSIC_SERIES_COLORS: readonly string[] = [
  PALETTE.green.base,
  PALETTE.blue.base,
  PALETTE.purple.base,
  PALETTE.orange.base,
  PALETTE.red.base,
  PALETTE.cyan.base,
  PALETTE.yellow.base,
  PALETTE.pink.base,
];

/**
 * Deterministic color for the Nth series in a chart.
 * Cycles through CLASSIC_SERIES_COLORS. Negative or non-finite indices are
 * coerced to 0.
 */
export function getSeriesColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return CLASSIC_SERIES_COLORS[0]!;
  }
  const i = Math.floor(index) % CLASSIC_SERIES_COLORS.length;
  return CLASSIC_SERIES_COLORS[i]!;
}

/**
 * FNV-1a 32-bit hash — small, fast, no external dependency, good distribution
 * for short string keys like metric labels. Returned as an unsigned int.
 */
function hashKey(key: string): number {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    // 32-bit FNV prime multiply, kept inside Math.imul for correctness.
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Stable color for a series identified by an arbitrary key. The same key
 * resolves to the same color across reloads, which keeps dashboards visually
 * consistent when series order changes between queries.
 */
export function getSeriesColorByKey(key: string): string {
  const hash = hashKey(key);
  return getSeriesColor(hash % CLASSIC_SERIES_COLORS.length);
}
