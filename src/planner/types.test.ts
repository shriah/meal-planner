import { describe, expect, it } from 'vitest';
import { dishesIn, emptyPlan, withDish, withoutDish, type SlotState } from './types';

describe('emptyPlan', () => {
  it('gives 21 meals with every part empty', () => {
    const p = emptyPlan(3);
    expect(p).toHaveLength(21);
    expect(p[0]).toEqual({ parts: [[], [], []] });
    expect(p[0].parts[0]).not.toBe(p[1].parts[0]);
  });
});

describe('dishesIn', () => {
  it('an empty part holds no dishes; a filled one holds its list', () => {
    const s: SlotState = { parts: [[1], [], [4, 7]] };
    expect(dishesIn(s, 1)).toEqual([]);
    expect(dishesIn(s, 2)).toEqual([4, 7]);
  });
});

describe('withDish', () => {
  it('replaces the dish of a single part, in a new array', () => {
    const old = [2];
    const s: SlotState = { parts: [[1], old, []] };
    withDish(s, 1, 3, true);
    expect(s.parts[1]).toEqual([3]);
    expect(old).toEqual([2]);
  });

  it('appends to a many part in a new array, leaving the old one as it was', () => {
    const old = [4, 7];
    const s: SlotState = { parts: [[1], [], old] };
    withDish(s, 2, 9, false);
    expect(s.parts[2]).toEqual([4, 7, 9]);
    expect(old).toEqual([4, 7]);
  });
});

describe('withoutDish', () => {
  it('removes one dish from the middle, in a new array', () => {
    const old = [4, 7, 9];
    const s: SlotState = { parts: [[1], [], old] };
    withoutDish(s, 2, 7);
    expect(s.parts[2]).toEqual([4, 9]);
    expect(old).toEqual([4, 7, 9]);
  });

  it('empties a single part holding the dish, and leaves another dish alone', () => {
    const s: SlotState = { parts: [[1], [5], []] };
    withoutDish(s, 1, 6);
    expect(s.parts[1]).toEqual([5]);
    withoutDish(s, 1, 5);
    expect(s.parts[1]).toEqual([]);
  });
});
