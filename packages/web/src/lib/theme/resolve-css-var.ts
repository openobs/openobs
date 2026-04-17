/**
 * Resolve `var(--name[, fallback])` to its computed value.
 *
 * Canvas-rendered visualizations (uPlot axes, the heatmap painter) hand color
 * strings directly to the canvas 2D context, which cannot parse CSS custom
 * properties. Without this resolver, axis labels and cell colors render
 * invisibly because the context falls back to its default fill.
 *
 * Returns the input untouched on SSR or when neither the variable nor the
 * fallback is defined.
 */
export function resolveCssVar(value: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return value;
  const match = /^var\((--[^,)\s]+)(?:\s*,\s*([^)]+))?\)$/.exec(value.trim());
  if (!match) return value;
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(match[1]!)
    .trim();
  if (resolved) return resolved;
  return match[2]?.trim() ?? value;
}
