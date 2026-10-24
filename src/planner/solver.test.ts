import { describe, expect, it } from 'vitest';
import { is } from './matcher';
import { buildModel } from './plan';
import { solve } from './solver';
import { component } from './test-utils';
import { SLOT_COUNT, slotIndex, type ComponentLike } from './types';

const library: ComponentLike[] = [
  ...[1, 2, 3, 4].map((id) => component('base', { id, base_category_id: 10 })),
  ...[11, 12, 13, 14, 15].map((id) => component('curry', { id, protein_tag: id === 15 ? 'fish' : 'dal', dietary_tags: id === 15 ? ['non-veg'] : ['veg'] })),
  ...[21, 22, 23, 24].map((id) => component('subzi', { id })),
  ...[31, 32].map((id) => component('extra', { id })),
];
const quick = { timeLimitMs: Infinity, maxIterations: 20_000 };

describe('solver', () => {
  it('is deterministic for a seed and varies across seeds', () => {
    const m = () => buildModel({ library });
    const a = solve(m(), { ...quick, seed: 7 }).plan;
    const b = solve(m(), { ...quick, seed: 7 }).plan;
    const c = solve(m(), { ...quick, seed: 8 }).plan;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('always returns structurally valid slots', () => {
    const r = solve(buildModel({ library }), { ...quick, seed: 3 });
    expect(r.score.hard).toBe(0);
    for (const s of r.plan) {
      expect(library.find((c) => c.id === s.base)?.componentType).toBe('base');
      if (s.curry !== undefined) expect(library.find((c) => c.id === s.curry)?.componentType).toBe('curry');
      if (s.subzi !== undefined) expect(library.find((c) => c.id === s.subzi)?.componentType).toBe('subzi');
      expect(new Set(s.extras).size).toBe(s.extras.length);
    }
  });

  it('never moves pinned values, even when they break a rule, and explains the break', () => {
    const noFish = { kind: 'count' as const, id: 'no-fish', label: 'No fish', origin: 'rule' as const, select: is('protein_tag', 'fish'), groupBy: 'slot' as const, bounds: { hardMax: 0 } };
    const r = solve(buildModel({ library, constraints: [noFish] }), {
      ...quick, seed: 1, pins: { 'friday-lunch': { base_id: 2, curry_id: 15 } },
    });
    const friday = r.plan[slotIndex('friday', 'lunch')];
    expect(friday).toMatchObject({ base: 2, curry: 15 });
    expect(r.score.hard).toBe(1);
    expect(r.score.justifications.filter((j) => j.level === 'hard')).toEqual([
      expect.objectContaining({ constraintId: 'no-fish', group: { day: 'friday', meal: 'lunch' } }),
    ]);
  });

  it('satisfies a weekly minimum the greedy generator could not express', () => {
    const fishTwice = { kind: 'count' as const, id: 'fish-2', label: 'Fish twice a week', origin: 'rule' as const, select: is('protein_tag', 'fish'), groupBy: 'plan' as const, bounds: { hardMin: 2 } };
    const r = solve(buildModel({ library, constraints: [fishTwice] }), { ...quick, seed: 5 });
    expect(r.score.hard).toBe(0);
    expect(r.plan.filter((s) => s.curry === 15).length).toBeGreaterThanOrEqual(2);
  });

  it('stops early on a plateau once every hard rule holds', () => {
    const r = solve(buildModel({ library }), { timeLimitMs: Infinity, maxIterations: 1_000_000, plateauIterations: 500, seed: 2 });
    expect(r.stats.stopReason).toBe('plateau');
    expect(r.stats.iterations).toBeLessThan(1_000_000);
  });

  it('fills every slot', () => {
    const r = solve(buildModel({ library }), { ...quick, seed: 4 });
    expect(r.plan.filter((s) => s.base !== undefined)).toHaveLength(SLOT_COUNT);
  });
});
