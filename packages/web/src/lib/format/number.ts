import type { FormattedValue } from './types';
import { NO_VALUE } from './types';

/** True if the value is a finite, usable number. */
function isFiniteNumber(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Default decimal count when the caller does not specify. */
const DEFAULT_DECIMALS = 2;

/** Clamp decimals into `toFixed`'s valid range. */
function clampDecimals(d: number | undefined, fallback: number): number {
  if (typeof d !== 'number' || !Number.isFinite(d)) return fallback;
  return Math.max(0, Math.min(20, Math.floor(d)));
}

/** Format a number with fixed decimals; strip trailing zeros for small magnitudes so "1.50" → "1.5" only when decimals is undefined. */
function toFixed(v: number, decimals: number): string {
  return v.toFixed(decimals);
}

/**
 * SI-ish short form:
 *   1234                  -> "1.23K"
 *   1_500_000             -> "1.5M"
 *   2_300_000_000         -> "2.3B"
 *   1_200_000_000_000     -> "1.2T"
 *
 * Negative values produce "-1.23K". Values below 1000 are rendered as-is
 * with the requested decimals (default 2).
 */
export function formatShort(
  value: number | null | undefined,
  decimals?: number,
): FormattedValue {
  if (!isFiniteNumber(value)) return { text: NO_VALUE };

  const d = clampDecimals(decimals, DEFAULT_DECIMALS);
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs < 1000) return { text: `${sign}${toFixed(abs, d)}` };

  // Use Q (quintillion) as the final bucket; anything larger falls back to Q.
  const units: Array<[number, string]> = [
    [1e3, 'K'],
    [1e6, 'M'],
    [1e9, 'B'],
    [1e12, 'T'],
    [1e15, 'P'],
    [1e18, 'Q'],
  ];

  let chosen: [number, string] = units[0]!;
  for (const unit of units) {
    if (abs >= unit[0]) chosen = unit;
  }
  const [scale, suffix] = chosen;
  return { text: `${sign}${toFixed(abs / scale, d)}${suffix}` };
}

/** Input expressed in 0–100 range. 42.3 -> "42.3%". */
export function formatPercent(
  value: number | null | undefined,
  decimals?: number,
): FormattedValue {
  if (!isFiniteNumber(value)) return { text: NO_VALUE };
  const d = clampDecimals(decimals, 1);
  return { text: toFixed(value, d), suffix: '%' };
}

/** Input expressed in 0–1 range. 0.423 -> "42.3%". */
export function formatPercentUnit(
  value: number | null | undefined,
  decimals?: number,
): FormattedValue {
  if (!isFiniteNumber(value)) return { text: NO_VALUE };
  const d = clampDecimals(decimals, 1);
  return { text: toFixed(value * 100, d), suffix: '%' };
}

/** Fixed decimals, no unit. Defaults to 2 decimals. */
export function formatDecimal(
  value: number | null | undefined,
  decimals?: number,
): FormattedValue {
  if (!isFiniteNumber(value)) return { text: NO_VALUE };
  const d = clampDecimals(decimals, DEFAULT_DECIMALS);
  return { text: toFixed(value, d) };
}
