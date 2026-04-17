import React, { useMemo, useState, useCallback } from 'react';
import type { DataFrame, Field, Threshold } from '../../lib/data/types.js';
import { getFieldDisplayName } from '../../lib/data/frame.js';
import { formatValueForDisplay } from '../../lib/format/index.js';
import { resolveThresholdColor } from '../../lib/theme/index.js';

/**
 * Props accepted by {@link TableViz}.
 *
 * The component renders a single wide `DataFrame` as an HTML `<table>`.
 * Per-column units and thresholds are read from `field.config` by default but
 * can be overridden by name via `unitOverrides` / `thresholdsOverrides` to let
 * panel options win over field-level hints.
 */
export interface TableVizProps {
  /** Wide table frame — one frame carrying every column. */
  frame: DataFrame;
  /** Map of `field.name` -> unit id; overrides `field.config.unit`. */
  unitOverrides?: Record<string, string>;
  /** Map of `field.name` -> thresholds; overrides `field.config.thresholds`. */
  thresholdsOverrides?: Record<string, Threshold[]>;
  /** Starting sort state. If omitted, rows render in frame order. */
  initialSort?: { field: string; dir: 'asc' | 'desc' };
  /** Render a leading `#` column with 1-based indices. Default `false`. */
  showRowIndex?: boolean;
  /** Body max height in px before it becomes scrollable. Default `360`. */
  maxHeight?: number;
  /** How threshold color applies to numeric cells. Default `'text'`. */
  colorMode?: 'cell' | 'text' | 'none';
}

type SortDir = 'asc' | 'desc';
interface SortState {
  field: string;
  dir: SortDir;
}

const NO_VALUE = '\u2014'; // em dash

/**
 * Parse a hex color (`#rrggbb`) into an `rgba(...)` string at `alpha`.
 * Returns the input untouched when it is not a hex triplet — safe to pass
 * `var(...)` or named colors through.
 */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m || !m[1]) return color;
  const hex = m[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** `true` for fields whose cells should be right-aligned / tabular-nums. */
function isNumericField(field: Field): boolean {
  return field.type === 'number';
}

/**
 * Compare two values of a given `FieldType`. Nulls always sort to the end
 * regardless of direction; `dir` is applied to the non-null comparison. The
 * returned integer follows the usual `Array.prototype.sort` convention.
 */
function compareValues(
  a: unknown,
  b: unknown,
  type: Field['type'],
  dir: SortDir,
): number {
  const aNull = a === null || a === undefined || (typeof a === 'number' && Number.isNaN(a));
  const bNull = b === null || b === undefined || (typeof b === 'number' && Number.isNaN(b));
  if (aNull && bNull) return 0;
  // Nulls always last — independent of sort direction.
  if (aNull) return 1;
  if (bNull) return -1;

  let cmp = 0;
  if (type === 'number' || type === 'time') {
    const an = a as number;
    const bn = b as number;
    cmp = an < bn ? -1 : an > bn ? 1 : 0;
  } else if (type === 'boolean') {
    const av = a ? 1 : 0;
    const bv = b ? 1 : 0;
    cmp = av - bv;
  } else {
    const as = String(a);
    const bs = String(b);
    cmp = as < bs ? -1 : as > bs ? 1 : 0;
  }

  return dir === 'asc' ? cmp : -cmp;
}

/**
 * Sortable HTML table visualization.
 *
 * Columns take their display name from {@link getFieldDisplayName} and their
 * unit/thresholds from `field.config` (optionally overridden by props).
 * Clicking a header cycles `none -> asc -> desc -> none`; the sort is stable
 * via explicit index tiebreak. Pure presentation — the caller supplies data.
 */
export default function TableViz({
  frame,
  unitOverrides,
  thresholdsOverrides,
  initialSort,
  showRowIndex = false,
  maxHeight = 360,
  colorMode = 'text',
}: TableVizProps) {
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);

  const fields = frame.fields;
  const length = frame.length;

  const onHeaderClick = useCallback(
    (fieldName: string) => {
      setSort((prev) => {
        if (!prev || prev.field !== fieldName) {
          return { field: fieldName, dir: 'asc' };
        }
        if (prev.dir === 'asc') return { field: fieldName, dir: 'desc' };
        return null; // third click clears sort
      });
    },
    [],
  );

  /**
   * Row order — an array of indices into the frame's parallel value arrays.
   * When no sort is active this is simply `[0, 1, ..., length - 1]`.
   * Sorting uses the target field's type for comparison and breaks ties by
   * the original index to keep the sort stable.
   */
  const order = useMemo<number[]>(() => {
    const base: number[] = [];
    for (let i = 0; i < length; i++) base.push(i);
    if (!sort) return base;

    const sortField = fields.find((f) => f.name === sort.field);
    if (!sortField) return base;

    const values = sortField.values;
    const type = sortField.type;
    const dir = sort.dir;

    base.sort((ia, ib) => {
      const c = compareValues(values[ia], values[ib], type, dir);
      if (c !== 0) return c;
      return ia - ib; // stable tiebreak
    });
    return base;
  }, [fields, length, sort]);

  if (length === 0 || fields.length === 0) {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-sm text-on-surface-variant"
        style={{ minHeight: 80 }}
      >
        No data
      </div>
    );
  }

  const headerBg = 'var(--color-surface-high)';
  const borderColor = 'var(--color-outline-variant)';

  return (
    <div
      className="w-full overflow-auto"
      style={{
        maxHeight,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
      }}
    >
      <table
        className="w-full border-collapse text-sm"
        style={{ color: 'var(--color-on-surface)' }}
      >
        <thead>
          <tr>
            {showRowIndex && (
              <th
                scope="col"
                className="sticky top-0 z-10 px-2 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant"
                style={{
                  backgroundColor: headerBg,
                  borderBottom: `1px solid ${borderColor}`,
                  width: '3rem',
                }}
              >
                #
              </th>
            )}
            {fields.map((field) => {
              const isNum = isNumericField(field);
              const sortedHere = sort && sort.field === field.name;
              const arrow = sortedHere
                ? sort.dir === 'asc'
                  ? ' \u25B2'
                  : ' \u25BC'
                : '';
              const align = isNum ? 'text-right' : 'text-left';
              const displayName = getFieldDisplayName(field, frame);
              return (
                <th
                  key={field.name}
                  scope="col"
                  aria-sort={
                    sortedHere
                      ? sort.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className={`sticky top-0 z-10 cursor-pointer select-none px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant hover:text-on-surface ${align}`}
                  style={{
                    backgroundColor: headerBg,
                    borderBottom: `1px solid ${borderColor}`,
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => onHeaderClick(field.name)}
                  title={`Sort by ${displayName}`}
                >
                  {displayName}
                  {arrow}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {order.map((rowIdx, visualRow) => (
            <tr
              key={rowIdx}
              className="hover:bg-[var(--color-surface-high)]"
              style={{ borderTop: `1px solid ${borderColor}` }}
            >
              {showRowIndex && (
                <td
                  className="px-2 py-1 text-right tabular-nums text-on-surface-variant"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {visualRow + 1}
                </td>
              )}
              {fields.map((field) => {
                const raw = field.values[rowIdx];
                return (
                  <TableCell
                    key={field.name}
                    field={field}
                    value={raw}
                    unitOverride={unitOverrides?.[field.name]}
                    thresholdsOverride={thresholdsOverrides?.[field.name]}
                    colorMode={colorMode}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Render a single cell. Kept as a dedicated component so the per-cell
 * threshold / unit resolution is co-located and the row loop stays compact.
 */
function TableCell({
  field,
  value,
  unitOverride,
  thresholdsOverride,
  colorMode,
}: {
  field: Field;
  value: unknown;
  unitOverride: string | undefined;
  thresholdsOverride: Threshold[] | undefined;
  colorMode: 'cell' | 'text' | 'none';
}) {
  const isNull =
    value === null ||
    value === undefined ||
    (typeof value === 'number' && Number.isNaN(value));

  if (isNull) {
    const align = isNumericField(field) ? 'text-right' : 'text-left';
    return (
      <td
        className={`px-2 py-1 text-on-surface-variant ${align}`}
        style={{ whiteSpace: 'nowrap' }}
      >
        {NO_VALUE}
      </td>
    );
  }

  if (field.type === 'time') {
    const text = formatValueForDisplay(value as number, 'dateTime');
    return (
      <td
        className="px-2 py-1 text-left tabular-nums"
        style={{ whiteSpace: 'nowrap' }}
      >
        {text}
      </td>
    );
  }

  if (field.type === 'number') {
    const unit = unitOverride ?? field.config.unit;
    const decimals = field.config.decimals;
    const text = formatValueForDisplay(value as number, unit, decimals);
    const thresholds = thresholdsOverride ?? field.config.thresholds;

    let color: string | undefined;
    let background: string | undefined;
    if (colorMode !== 'none' && thresholds && thresholds.length > 0) {
      const resolved = resolveThresholdColor(
        value as number,
        thresholds,
        'var(--color-on-surface)',
      );
      if (colorMode === 'text') {
        color = resolved;
      } else if (colorMode === 'cell') {
        background = withAlpha(resolved, 0.15);
      }
    }

    const style: React.CSSProperties = { whiteSpace: 'nowrap' };
    if (color !== undefined) style.color = color;
    if (background !== undefined) style.backgroundColor = background;

    return (
      <td className="px-2 py-1 text-right tabular-nums" style={style}>
        {text}
      </td>
    );
  }

  if (field.type === 'boolean') {
    return (
      <td className="px-2 py-1 text-left" style={{ whiteSpace: 'nowrap' }}>
        {value ? 'true' : 'false'}
      </td>
    );
  }

  // string / other
  return (
    <td
      className="px-2 py-1 text-left"
      style={{ whiteSpace: 'nowrap' }}
    >
      {String(value)}
    </td>
  );
}
