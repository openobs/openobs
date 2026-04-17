/**
 * Public entry point for the value formatter registry.
 *
 * Chart axes, legends, and stat panels should import from this module only;
 * the internal `number.ts`, `bytes.ts`, `time.ts`, `formatRate.ts` files are
 * implementation details.
 */

export type { FormattedValue, ValueFormatter } from './types';
export {
  getFormatter,
  registerFormatter,
  listUnits,
  type UnitId,
} from './registry';

import { getFormatter } from './registry';

/**
 * Convenience wrapper that flattens a `FormattedValue` to a single display string.
 * Useful for axis tick labels, tooltips, and anywhere the caller does not need
 * to style prefix/suffix separately.
 */
export function formatValueForDisplay(
  value: number | null | undefined,
  unit: string | undefined,
  decimals?: number,
): string {
  const fmt = getFormatter(unit);
  const out = fmt(value, decimals);
  return `${out.prefix ?? ''}${out.text}${out.suffix ?? ''}`;
}
