import { describe, expect, it } from 'vitest';
import { all, is, planWeek, type ComponentLike, type PlanSlotLike } from '@/planner';
import { compileRules, type RuleRecord } from './record';
import { describeSpec, RuleSpecSchema, type RuleSpecInput } from './templates';

// ─── Library: two base categories, several curries/subzis, extras in two categories ──────────
const RICE = 10;
const BREAD = 20;
const LIQUID = 30;
const SWEET = 40;
const mk = (id: number, componentType: ComponentLike['componentType'], extra: Partial<ComponentLike> = {}): ComponentLike =>
  ({ id, name: `#${id}`, componentType, dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: ['everyday'], ...extra });
const library: ComponentLike[] = [
  mk(1, 'base', { name: 'Rice', base_category_id: RICE }),
  mk(2, 'base', { name: 'Jeera Rice', base_category_id: RICE }),
  mk(3, 'base', { name: 'Roti', base_category_id: BREAD }),
  mk(4, 'base', { name: 'Paratha', base_category_id: BREAD }),
  mk(11, 'curry', { name: 'Dal', protein_tag: 'dal' }),
  mk(12, 'curry', { name: 'Sambar', protein_tag: 'dal', regional_tags: ['south-indian'] }),
  mk(13, 'curry', { name: 'Fish Curry', protein_tag: 'fish', dietary_tags: ['non-veg'] }),
  mk(14, 'curry', { name: 'Paneer Masala', protein_tag: 'paneer' }),
  mk(15, 'curry', { name: 'Chole' }),
  mk(21, 'subzi', { name: 'Bhindi' }),
  mk(22, 'subzi', { name: 'Aloo Gobi' }),
  mk(23, 'subzi', { name: 'Beans' }),
  mk(31, 'extra', { name: 'Rasam', extra_category_id: LIQUID }),
  mk(32, 'extra', { name: 'Buttermilk', extra_category_id: LIQUID }),
  mk(41, 'extra', { name: 'Kheer', extra_category_id: SWEET }),
];
const known = {
  components: new Set(library.map((c) => c.id)),
  baseCategories: new Set([RICE, BREAD]),
  extraCategories: new Set([LIQUID, SWEET]),
};

const record = (spec: RuleSpecInput, id = 1): RuleRecord => ({ id, name: `Rule ${id}`, enabled: true, spec, created_at: '' });
const plan = (specs: RuleSpecInput[], seed: number) => {
  const { constraints, issues } = compileRules(specs.map((s, i) => record(s, i + 1)), known);
  expect(issues).toEqual([]);
  return planWeek({ library, constraints }, { seed, timeLimitMs: Infinity, maxIterations: 30_000, plateauIterations: 3000 });
};
const SEEDS = [1, 2, 3];
const at = (r: { slots: PlanSlotLike[] }, day: string, meal: string) => r.slots.find((s) => s.day === day && s.meal_slot === meal)!;
const hard = (r: ReturnType<typeof plan>) => r.justifications.filter((j) => j.level === 'hard');

describe('rule templates in the planner', () => {
  it.each(SEEDS)('exclude: never places fish on Fridays (seed %i)', (seed) => {
    const r = plan([{ template: 'exclude', params: { match: is('protein_tag', 'fish'), scope: { days: ['friday'] } } }], seed);
    expect(hard(r)).toEqual([]);
    for (const s of r.slots.filter((x) => x.day === 'friday')) expect(s.curry_id).not.toBe(13);
  });

  it.each(SEEDS)('only_allow: curries at lunch are dal only (seed %i)', (seed) => {
    const r = plan([{ template: 'only_allow', params: { match: is('protein_tag', 'dal'), roles: ['curry'], scope: { meals: ['lunch'] } } }], seed);
    expect(hard(r)).toEqual([]);
    for (const s of r.slots.filter((x) => x.meal_slot === 'lunch' && x.curry_id !== undefined)) expect([11, 12]).toContain(s.curry_id);
  });

  it.each(SEEDS)('require: Friday lunch always has fish (seed %i)', (seed) => {
    const r = plan([{ template: 'require', params: { match: is('protein_tag', 'fish'), scope: { days: ['friday'], meals: ['lunch'] } } }], seed);
    expect(hard(r)).toEqual([]);
    expect(at(r, 'friday', 'lunch').curry_id).toBe(13);
  });

  it.each(SEEDS)('limit per week: 2–3 paneer dishes (seed %i)', (seed) => {
    const r = plan([{ template: 'limit', params: { match: is('protein_tag', 'paneer'), per: 'week', min: 2, max: 3 } }], seed);
    expect(hard(r)).toEqual([]);
    const n = r.slots.filter((s) => s.curry_id === 14).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(3);
  });

  it.each(SEEDS)('limit per day, scoped to weekend days: at least one sweet each weekend day (seed %i)', (seed) => {
    const r = plan([{ template: 'limit', params: { match: is('extra_category_id', SWEET), per: 'day', min: 1, scope: { days: ['saturday', 'sunday'] } } }], seed);
    expect(hard(r)).toEqual([]);
    for (const day of ['saturday', 'sunday']) {
      expect(r.slots.filter((s) => s.day === day).some((s) => s.extra_ids.includes(41))).toBe(true);
    }
  });

  it.each(SEEDS)('no_repeat within 3 days, scoped to dinners (seed %i)', (seed) => {
    const r = plan([{ template: 'no_repeat', params: { match: is('componentType', 'curry'), within: 3, scope: { meals: ['dinner'] } } }], seed);
    expect(hard(r)).toEqual([]);
    const dinners = r.slots.filter((s) => s.meal_slot === 'dinner');
    dinners.forEach((s, i) => {
      for (const later of dinners.slice(i + 1, i + 3)) if (s.curry_id !== undefined) expect(later.curry_id).not.toBe(s.curry_id);
    });
  });

  it.each(SEEDS)('allowed_meals: rice bases only at lunch (seed %i)', (seed) => {
    const r = plan([{ template: 'allowed_meals', params: { match: is('base_category_id', RICE), meals: ['lunch'] } }], seed);
    expect(hard(r)).toEqual([]);
    for (const s of r.slots.filter((x) => x.meal_slot !== 'lunch')) expect([1, 2]).not.toContain(s.base_id);
  });

  it.each(SEEDS)('skip_when: bread meals have no subzi (seed %i)', (seed) => {
    const r = plan([{ template: 'skip_when', params: { when: is('base_category_id', BREAD), skip: ['subzi'] } }], seed);
    expect(hard(r)).toEqual([]);
    for (const s of r.slots.filter((x) => [3, 4].includes(x.base_id))) expect(s.subzi_id).toBeUndefined();
  });

  it.each(SEEDS)('require_with: rice meals include a liquid extra, and Sambar brings Rasam (seed %i)', (seed) => {
    const r = plan([
      { template: 'require_with', params: { when: all(is('role', 'base'), is('base_category_id', RICE)), extraCategories: [LIQUID] } },
      { template: 'require_with', params: { when: is('id', 12), components: [31] } },
    ], seed);
    expect(hard(r)).toEqual([]);
    for (const s of r.slots.filter((x) => [1, 2].includes(x.base_id))) expect(s.extra_ids.some((e) => [31, 32].includes(e))).toBe(true);
    for (const s of r.slots.filter((x) => x.curry_id === 12)) expect(s.extra_ids).toContain(31);
  });

  it('prefer strength: soft rules give way to hard ones and are reported as soft', () => {
    const r = plan([
      { template: 'exclude', params: { match: is('protein_tag', 'fish') } },
      { template: 'require', params: { match: is('protein_tag', 'fish'), scope: { days: ['friday'], meals: ['lunch'] }, strength: 'prefer' } },
    ], 1);
    expect(hard(r)).toEqual([]);
    expect(r.justifications).toContainEqual(expect.objectContaining({ ruleId: 2, level: 'soft', group: { day: 'friday', meal: 'lunch' } }));
  });

  it('prefer/avoid nudges choices without forbidding', () => {
    const count = (direction: 'prefer' | 'avoid') => SEEDS.reduce((n, seed) =>
      n + plan([{ template: 'prefer', params: { match: is('id', 15), direction, weight: 5 } }], seed).slots.filter((s) => s.curry_id === 15).length, 0);
    expect(count('prefer')).toBeGreaterThan(count('avoid'));
  });
});

describe('rule template params', () => {
  const valid = (spec: unknown) => RuleSpecSchema.safeParse(spec).success;

  it('fills defaults', () => {
    const parsed = RuleSpecSchema.parse({ template: 'no_repeat', params: { match: is('componentType', 'curry') } });
    expect(parsed).toEqual({ template: 'no_repeat', params: { match: is('componentType', 'curry'), within: 'week', roles: ['base', 'curry', 'subzi'], strength: 'must' } });
  });

  it('rejects incomplete or contradictory params', () => {
    expect(valid({ template: 'limit', params: { match: is('role', 'curry'), per: 'week' } })).toBe(false);
    expect(valid({ template: 'limit', params: { match: is('role', 'curry'), per: 'week', min: 3, max: 2 } })).toBe(false);
    expect(valid({ template: 'require_with', params: { when: is('id', 1) } })).toBe(false);
    expect(valid({ template: 'only_allow', params: { match: is('id', 1), roles: [] } })).toBe(false);
    expect(valid({ template: 'skip_when', params: { when: is('id', 1), skip: ['base'] } })).toBe(false);
    expect(valid({ template: 'exclude', params: { match: is('id', 1), scope: { days: [] } } })).toBe(false);
    expect(valid({ template: 'nope', params: {} })).toBe(false);
  });

  it('describes rules with names', () => {
    const names = { component: (id: number) => library.find((c) => c.id === id)?.name, baseCategory: () => 'Rice', extraCategory: () => 'Liquid' };
    const d = (spec: RuleSpecInput) => describeSpec(RuleSpecSchema.parse(spec), names);
    expect(d({ template: 'exclude', params: { match: is('protein_tag', 'fish'), scope: { days: ['friday'], meals: ['lunch'] } } }))
      .toBe('Never include dishes with fish on Friday at lunch');
    expect(d({ template: 'require_with', params: { when: is('id', 12), components: [31], extraCategories: [LIQUID], strength: 'prefer' } }))
      .toBe('With Sambar, also include Rasam and an extra from Liquid (preferred)');
    expect(d({ template: 'limit', params: { match: is('dietary_tags', 'non-veg'), per: 'week', max: 2 } }))
      .toBe('Non-veg dishes: at most 2 per week');
  });
});
