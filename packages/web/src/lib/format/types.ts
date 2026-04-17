/**
 * Public types for the value formatter registry.
 *
 * A `ValueFormatter` converts a numeric value into a {@link FormattedValue}
 * that a chart axis, legend, or stat panel can render. The return value is
 * deliberately split into `prefix`, `text`, and `suffix` so callers can style
 * the unit differently from the number (e.g. smaller suffix text).
 */

export type FormattedValue = {
  text: string;
  suffix?: string;
  prefix?: string;
  color?: string;
};

export type ValueFormatter = (
  value: number | null | undefined,
  decimals?: number,
) => FormattedValue;

/** Value shown when input is null/undefined/NaN. Centralized so every formatter agrees. */
export const NO_VALUE = '\u2014'; // em dash
