import { describe, expect, it } from 'vitest';
import { PARTS, dishesIn, partOf, withDish, withoutDish, type SlotState } from './types';

const part = (role: string) => PARTS.find((p) => p.role === role)!;

describe('PARTS', () => {
  it('lists base, curry, subzi and extra in that order; only extra holds many', () => {
    expect(PARTS.map((p) => [p.role, p.many, p.pin])).toEqual([
      ['base', false, 'base_id'],
      ['curry', false, 'curry_id'],
      ['subzi', false, 'subzi_id'],
      ['extra', true, 'extra_ids'],
    ]);
  });

  it('partOf finds the part a dish type fills', () => {
    expect(partOf('subzi')).toBe(part('subzi'));
    expect(partOf(undefined)).toBeUndefined();
  });
});

describe('dishesIn', () => {
  it('an empty curry holds no dishes', () => {
    expect(dishesIn({ base: 1, extras: [] }, part('curry'))).toEqual([]);
  });

  it('a filled single part holds its dish; extras hold their list', () => {
    const s: SlotState = { base: 1, curry: 2, extras: [4, 7] };
    expect(dishesIn(s, part('curry'))).toEqual([2]);
    expect(dishesIn(s, part('extra'))).toEqual([4, 7]);
  });
});

describe('withDish', () => {
  it('replaces the dish of a single part', () => {
    const s: SlotState = { base: 1, curry: 2, extras: [] };
    withDish(s, part('curry'), 3);
    expect(s.curry).toBe(3);
  });

  it('appends to extras in a new array, leaving the old one as it was', () => {
    const old = [4, 7];
    const s: SlotState = { base: 1, extras: old };
    withDish(s, part('extra'), 9);
    expect(s.extras).toEqual([4, 7, 9]);
    expect(old).toEqual([4, 7]);
  });
});

describe('withoutDish', () => {
  it('removes one extra from the middle, in a new array', () => {
    const old = [4, 7, 9];
    const s: SlotState = { base: 1, extras: old };
    withoutDish(s, part('extra'), 7);
    expect(s.extras).toEqual([4, 9]);
    expect(old).toEqual([4, 7, 9]);
  });

  it('empties a single part holding the dish, and leaves another dish alone', () => {
    const s: SlotState = { base: 1, subzi: 5, extras: [] };
    withoutDish(s, part('subzi'), 6);
    expect(s.subzi).toBe(5);
    withoutDish(s, part('subzi'), 5);
    expect(s.subzi).toBeUndefined();
  });
});
