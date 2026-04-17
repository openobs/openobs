import type { FormattedValue, ValueFormatter } from './types';
import { NO_VALUE } from './types';

function isFiniteNumber(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clampDecimals(d: number | undefined, fallback: number): number {
  if (typeof d !== 'number' || !Number.isFinite(d)) return fallback;
  return Math.max(0, Math.min(20, Math.floor(d)));
}

/**
 * Rate per second. Input is an already-computed rate (value/sec), not a counter.
 * Example: `formatRate(1.23, 2, 'req')` -> "1.23 req/s".
 *
 * The returned suffix includes a leading space so prefix+text+suffix reads naturally.
 */
export function formatRate(
  value: number | null | undefined,
  decimals?: number,
  unit: string = 'ops',
): FormattedValue {
  if (!isFiniteNumber(value)) return { text: NO_VALUE };
  const d = clampDecimals(decimals, 2);
  return { text: value.toFixed(d), suffix: ` ${unit}/s` };
}

/**
 * Build a `ValueFormatter` bound to a specific rate unit. Used by the registry
 * so `'reqps'` and `'ops'` can both share `formatRate` with different labels.
 */
export function makeRateFormatter(unit: string): ValueFormatter {
  return (value, decimals) => formatRate(value, decimals, unit);
}
