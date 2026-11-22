import { describe, expect, it } from 'vitest';
import type { LegacyParts } from '@/db/parts';
import type { PartSlot } from '@/planner';
import { fromLegacySlot, toLegacySlot, toPartPins, toWeekPartPins } from './legacy-slots';

const legacy: LegacyParts = { base: 10, curry: 11, subzi: 12, extra: 13 };

describe('toLegacySlot / fromLegacySlot', () => {
  it('round trips a meal with base, curry and two extras', () => {
    const s: PartSlot = { day: 'monday', meal_slot: 'lunch', parts: { 10: [1], 11: [2], 12: [], 13: [3, 4] } };
    const plan = toLegacySlot(s, legacy);
    expect(plan).toEqual({ day: 'monday', meal_slot: 'lunch', base_id: 1, curry_id: 2, extra_ids: [3, 4] });
    expect('subzi_id' in plan).toBe(false);
    expect(fromLegacySlot(plan, legacy)).toEqual(s);
  });

  it('round trips a base-only meal', () => {
    const s: PartSlot = { day: 'friday', meal_slot: 'dinner', parts: { 10: [1], 11: [], 12: [], 13: [] } };
    const plan = toLegacySlot(s, legacy);
    expect(plan).toEqual({ day: 'friday', meal_slot: 'dinner', base_id: 1, extra_ids: [] });
    expect(fromLegacySlot(plan, legacy)).toEqual(s);
  });

  it('throws for two curries, which a legacy slot cannot hold', () => {
    const s: PartSlot = { day: 'monday', meal_slot: 'lunch', parts: { 10: [1], 11: [2, 5], 12: [], 13: [] } };
    expect(() => toLegacySlot(s, legacy)).toThrow();
  });

  it('throws for an empty base', () => {
    const s: PartSlot = { day: 'monday', meal_slot: 'lunch', parts: { 10: [], 11: [], 12: [], 13: [] } };
    expect(() => toLegacySlot(s, legacy)).toThrow();
  });
});

describe('toPartPins', () => {
  it('leaves an unset part free', () => {
    expect(toPartPins({}, legacy)).toEqual({});
    expect(toPartPins({ base_id: 1 }, legacy)).toEqual({ 10: [1] });
  });
  it('locks a null curry or subzi empty', () => {
    expect(toPartPins({ curry_id: null, subzi_id: null }, legacy)).toEqual({ 11: [], 12: [] });
  });
  it('locks a curry to its dish', () => {
    expect(toPartPins({ curry_id: 2, subzi_id: 3 }, legacy)).toEqual({ 11: [2], 12: [3] });
  });
  it('locks empty extras empty and copies a list', () => {
    expect(toPartPins({ extra_ids: [] }, legacy)).toEqual({ 13: [] });
    const ids = [4, 5];
    const pins = toPartPins({ extra_ids: ids }, legacy);
    expect(pins).toEqual({ 13: [4, 5] });
    expect(pins[13]).not.toBe(ids);
  });
  it('converts a whole week', () => {
    expect(toWeekPartPins({ 'monday-lunch': { base_id: 1, curry_id: null }, 'tuesday-dinner': { extra_ids: [] } }, legacy)).toEqual({
      'monday-lunch': { 10: [1], 11: [] },
      'tuesday-dinner': { 13: [] },
    });
  });
});
