import type { Threshold } from '../data/types.js';
import { PALETTE } from './palette.js';

/**
 * Resolve a numeric value to its threshold color.
 *
 *  - Returns the color of the highest-value threshold whose `value` is `<=`
 *    the input (i.e. the "current band").
 *  - If `value` is null-ish or NaN, returns `defaultColor`, else the first
 *    threshold color if any, else `PALETTE.blue.base`.
 *  - If no threshold matches (all threshold values are above `value`), also
 *    falls back to the default.
 */
export function resolveThresholdColor(
  value: number,
  thresholds: Threshold[] | undefined,
  defaultColor?: string,
): string {
  const fallback =
    defaultColor ?? thresholds?.[0]?.color ?? PALETTE.blue.base;

  if (value === null || value === undefined || Number.isNaN(value)) {
    return fallback;
  }
  if (!thresholds || thresholds.length === 0) {
    return fallback;
  }

  // Copy + sort ascending so we don't mutate caller input and so unordered
  // threshold arrays still resolve correctly.
  const sorted = [...thresholds].sort((a, b) => a.value - b.value);

  let matched: string | undefined;
  for (const t of sorted) {
    if (t.value <= value) {
      matched = t.color;
    } else {
      break;
    }
  }

  return matched ?? fallback;
}
