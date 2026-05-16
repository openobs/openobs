/**
 * Unit tests for the slot-delay formula in QueryScheduler.
 *
 * Regression guard for Sprint 2 CODE_REVIEW: the previous formula hardcoded
 * `staggerSpreadMs / 60` and ignored the supposed `slotsPerSec` guard,
 * producing a fixed ~33 ms stride regardless of inputs.
 */

import { describe, it, expect } from 'vitest';
import { computeSlotDelayMs } from './query-scheduler.js';

describe('computeSlotDelayMs', () => {
  it('uses 1000 / slotsPerSec when a rate is configured', () => {
    // slotsPerSec=2 → 500 ms stride. Slot 0 fires immediately, slot 1 at 500.
    expect(computeSlotDelayMs({ slot: 0, slotsPerSec: 2, totalSlots: 60, spreadMs: 2000 })).toBe(0);
    expect(computeSlotDelayMs({ slot: 1, slotsPerSec: 2, totalSlots: 60, spreadMs: 2000 })).toBe(
      500,
    );
    expect(computeSlotDelayMs({ slot: 3, slotsPerSec: 2, totalSlots: 60, spreadMs: 2000 })).toBe(
      1500,
    );
  });

  it('falls back to spreadMs / totalSlots when no rate is configured', () => {
    // 10 slots over a 2000 ms spread → 200 ms stride.
    expect(computeSlotDelayMs({ slot: 0, slotsPerSec: 0, totalSlots: 10, spreadMs: 2000 })).toBe(0);
    expect(computeSlotDelayMs({ slot: 1, slotsPerSec: 0, totalSlots: 10, spreadMs: 2000 })).toBe(
      200,
    );
    expect(computeSlotDelayMs({ slot: 5, slotsPerSec: 0, totalSlots: 10, spreadMs: 2000 })).toBe(
      1000,
    );
  });

  it('returns 0 when neither a rate nor a slot budget is available', () => {
    expect(computeSlotDelayMs({ slot: 4, slotsPerSec: 0, totalSlots: 0, spreadMs: 2000 })).toBe(0);
  });
});
