import { describe, expect, test } from 'vitest';
import { computeSlotLayout, SLOT_W, SLOT_H } from './layout';

describe('computeSlotLayout', () => {
  test('returns one slot per signer', () => {
    expect(computeSlotLayout(1)).toHaveLength(1);
    expect(computeSlotLayout(4)).toHaveLength(4);
  });

  test('every slot has positive size and non-negative coordinates', () => {
    for (const s of computeSlotLayout(5)) {
      expect(s.slot_w).toBe(SLOT_W);
      expect(s.slot_h).toBe(SLOT_H);
      expect(s.slot_x).toBeGreaterThanOrEqual(0);
      expect(s.slot_y).toBeGreaterThanOrEqual(0);
      expect(s.slot_page).toBeGreaterThanOrEqual(1);
    }
  });

  test('slots on the same page do not vertically overlap', () => {
    const slots = computeSlotLayout(5);
    const page1 = slots.filter((s) => s.slot_page === 1);
    const ys = page1.map((s) => s.slot_y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(SLOT_H);
    }
  });

  test('overflows to a second page beyond per-page capacity', () => {
    const slots = computeSlotLayout(9);
    const pages = new Set(slots.map((s) => s.slot_page));
    expect(pages.size).toBeGreaterThanOrEqual(2);
  });

  test('is deterministic', () => {
    expect(computeSlotLayout(6)).toEqual(computeSlotLayout(6));
  });

  test('throws on non-positive count', () => {
    expect(() => computeSlotLayout(0)).toThrow();
  });
});
