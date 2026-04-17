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
 * Generic byte/bit scaler used by all three byte formatters.
 * Picks the largest unit where `abs(value) >= base` so the mantissa stays < base.
 */
function scale(
  value: number,
  base: number,
  units: readonly string[],
  decimals: number,
): FormattedValue {
  const sign = value < 0 ? '-' : '';
  let abs = Math.abs(value);
  let i = 0;
  while (abs >= base && i < units.length - 1) {
    abs /= base;
    i += 1;
  }
  // When the mantissa is a whole number (e.g. 1024 -> 1.00 KiB) we still honor the decimals arg.
  return { text: `${sign}${abs.toFixed(decimals)}`, suffix: ` ${units[i]}` };
}

const IEC_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const;
const SI_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
const BPS_UNITS = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps', 'Pbps'] as const;

/** IEC bytes (1024). e.g. 1_572_864 -> "1.50 MiB". */
export function formatBytes(
  value: number | null | undefined,
  decimals?: number,
): FormattedValue {
  if (!isFiniteNumber(value)) return { text: NO_VALUE };
  const d = clampDecimals(decimals, 2);
  return scale(value, 1024, IEC_UNITS, d);
}

/** SI bytes (1000). e.g. 1_500_000 -> "1.50 MB". */
export function formatBytesSI(
  value: number | null | undefined,
  decimals?: number,
): FormattedValue {
  if (!isFiniteNumber(value)) return { text: NO_VALUE };
  const d = clampDecimals(decimals, 2);
  return scale(value, 1000, SI_UNITS, d);
}

/** Bits-per-second family. Input is bits/sec. e.g. 1_500_000 -> "1.50 Mbps". */
export function formatBitsSI(
  value: number | null | undefined,
  decimals?: number,
): FormattedValue {
  if (!isFiniteNumber(value)) return { text: NO_VALUE };
  const d = clampDecimals(decimals, 2);
  return scale(value, 1000, BPS_UNITS, d);
}
