import type { FormattedValue } from './types';
import { NO_VALUE } from './types';

function isFiniteNumber(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clampDecimals(d: number | undefined, fallback: number): number {
  if (typeof d !== 'number' || !Number.isFinite(d)) return fallback;
  return Math.max(0, Math.min(20, Math.floor(d)));
}

/**
 * Auto-pick a time unit based on magnitude (seconds input).
 *   0.0012 -> "1.2 ms"
 *   0.5    -> "500 ms"
 *   45     -> "45 s"
 *   150    -> "2.5 min"
 *   3900   -> "1.08 h"
 *   90000  -> "1.04 d"
 */
export function formatDurationSeconds(
  value: number | null | undefined,
  decimals?: number,
): FormattedValue {
  if (!isFiniteNumber(value)) return { text: NO_VALUE };

  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  // Thresholds are chosen against abs(seconds). Suffix includes leading space
  // so callers rendering prefix+text+suffix get proper separation.
  if (abs === 0) {
    const d = clampDecimals(decimals, 0);
    return { text: (0).toFixed(d), suffix: ' s' };
  }

  if (abs < 1) {
    // milliseconds
    const ms = abs * 1000;
    const d = clampDecimals(decimals, ms < 10 ? 1 : 0);
    return { text: `${sign}${ms.toFixed(d)}`, suffix: ' ms' };
  }
  if (abs < 60) {
    const d = clampDecimals(decimals, abs < 10 ? 1 : 0);
    return { text: `${sign}${abs.toFixed(d)}`, suffix: ' s' };
  }
  if (abs < 3600) {
    const d = clampDecimals(decimals, 2);
    return { text: `${sign}${(abs / 60).toFixed(d)}`, suffix: ' min' };
  }
  if (abs < 86400) {
    const d = clampDecimals(decimals, 2);
    return { text: `${sign}${(abs / 3600).toFixed(d)}`, suffix: ' h' };
  }
  const d = clampDecimals(decimals, 2);
  return { text: `${sign}${(abs / 86400).toFixed(d)}`, suffix: ' d' };
}

/** Same picker but input is already in milliseconds. */
export function formatDurationMs(
  value: number | null | undefined,
  decimals?: number,
): FormattedValue {
  if (!isFiniteNumber(value)) return { text: NO_VALUE };
  return formatDurationSeconds(value / 1000, decimals);
}

/** Unix seconds -> locale datetime. Non-finite / null returns em-dash. */
export function formatDateTime(
  value: number | null | undefined,
): FormattedValue {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { text: NO_VALUE };
  }
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return { text: NO_VALUE };
  return { text: date.toLocaleString() };
}
