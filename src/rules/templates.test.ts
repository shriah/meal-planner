import { describe, expect, it } from 'vitest';
import { all, buildModel, emptyPlan, is, not, oneOf, planWeek, score, slotIndex, type ComponentLike, type PartSlot } from '@/planner';
import { capRules } from './defaults';
import { compileRules, type RuleRecord } from './record';
import { compileSpec, describeSpec, PREFER_COST, RuleSpecSchema, specReferences, OWNED_ONLY_TEMPLATES, TEMPLATE_GROUPS, TEMPLATE_IDS, type RuleSpecInput } from './templates';
import { TEST_RULE_PARTS } from './test-parts';

// ─── Library: two base categories, several curries/subzis, extras in two categories ──────────
const RICE = 10;
const BREAD = 20;
const LIQUID = 30;
const SWEET = 40;
const mk = (id: number, componentType: ComponentLike['componentType'], extra: Partial<ComponentLike> = {}): ComponentLike =>
  ({ id, name: `#${id}`, componentType, part_id: TEST_RULE_PARTS.legacy[componentType], dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: [], ...extra });
const library: ComponentLike[] = [
  mk(1, 'base', { name: 'Rice', base_category_id: RICE }),
  mk(2, 'base', { name: 'Jeera Rice', base_category_id: RICE }),
  mk(3, 'base', { name: 'Roti', base_category_id: BREAD }),
  mk(4, 'base', { name: 'Paratha', base_category_id: BREAD }),
  mk(11, 'curry', { name: 'Dal', protein_tag: 'dal', curry_category: 'lentil' }),
  mk(12, 'curry', { name: 'Sambar', protein_tag: 'dal', regional_tags: ['south-indian'], curry_category: 'lentil' }),
  mk(13, 'curry', { name: 'Fish Curry', protein_tag: 'fish', dietary_tags: ['non-veg'] }),
  mk(14, 'curry', { name: 'Paneer Masala', protein_tag: 'paneer' }),
  mk(15, 'curry', { name: 'Chole', curry_category: 'legume' }),
  mk(21, 'subzi', { name: 'Bhindi' }),
  mk(22, 'subzi', { name: 'Aloo Gobi' }),
  mk(23, 'subzi', { name: 'Beans' }),
  mk(31, 'extra', { name: 'Rasam', extra_category_id: LIQUID }),
  mk(32, 'extra', { name: 'Buttermilk', extra_category_id: LIQUID }),
  mk(41, 'extra', { name: 'Kheer', extra_category_id: SWEET }),
];
const known = {
  components: new Set(library.map((c) => c.id)),
  categories: new Set([RICE, BREAD, LIQUID, SWEET]),
  parts: new Set(TEST_RULE_PARTS.list.map((p) => p.id)),
};

/** A planned meal over TEST_RULE_PARTS (Base, Curry, Subzi, Extras: ids 1 to 4) in today's stored terms. */
interface StoredSlot { day: string; meal_slot: string; base_id: number; curry_id?: number; subzi_id?: number; extra_ids: number[] }
const storedSlot = (s: PartSlot): StoredSlot => ({
  day: s.day, meal_slot: s.meal_slot, base_id: s.parts[1][0],
  ...(s.parts[2].length ? { curry_id: s.parts[2][0] } : {}), ...(s.parts[3].length ? { subzi_id: s.parts[3][0] } : {}), extra_ids: s.parts[4],
});
const record = (spec: RuleSpecInput, id = 1): RuleRecord => ({ id, name: `Rule ${id}`, enabled: true, spec, created_at: '' });
/** Plans the rules (ids 1..n) with the curry and subzi caps every library has; the week in today's stored terms. */
const plan = (specs: RuleSpecInput[], seed: number) => {
  const caps = capRules(TEST_RULE_PARTS.list).map((r, i) => ({ ...r, id: specs.length + i + 1, enabled: true, created_at: '' }));
  const { constraints, issues } = compileRules([...specs.map((s, i) => record(s, i + 1)), ...caps], known, TEST_RULE_PARTS);
  expect(issues).toEqual([]);
  const r = planWeek({ library, parts: TEST_RULE_PARTS.list, constraints }, { seed, timeLimitMs: Infinity, maxIterations: 30_000, plateauIterations: 3000 });
  return { ...r, slots: r.slots.map(storedSlot) };
};
const SEEDS = [1, 2, 3];
const at = (r: { slots: StoredSlot[] }, day: string, meal: string) => r.slots.find((s) => s.day === day && s.meal_slot === meal)!;
const hard = (r: ReturnType<typeof plan>) => r.justifications.filter((j) => j.level === 'hard');

describe('rule templates in the planner', () => {
  it.each(SEEDS)('exclude: never places fish on Fridays (seed %i)', (seed) => {
    const r = plan([{ template: 'exclude', params: { match: is('protein_tag', 'fish'), scope: { days: ['friday'] } } }], seed);
    expect(hard(r)).toEqual([]);
    for (const s of r.slots.filter((x) => x.day === 'friday')) expect(s.curry_id).not.toBe(13);
  });

  it.each(SEEDS)('only_allow: curries at lunch are dal only (seed %i)', (seed) => {
    const r = plan([{ template: 'only_allow', params: { match: is('protein_tag', 'dal'), parts: [2], scope: { meals: ['lunch'] } } }], seed);
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
    const r = plan([{ template: 'skip_when', params: { when: is('base_category_id', BREAD), skip: [3] } }], seed);
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

  it.each(SEEDS)('pairs_with: Sambar only with rice; exclude: Fish Curry never planned (seed %i)', (seed) => {
    const r = plan([
      { template: 'pairs_with', params: { match: is('id', 12), baseCategories: [RICE] } },
      { template: 'exclude', params: { match: is('id', 13) } },
    ], seed);
    expect(hard(r)).toEqual([]);
    for (const s of r.slots.filter((x) => x.curry_id === 12)) expect([1, 2]).toContain(s.base_id);
    expect(r.slots.some((s) => s.curry_id === 13)).toBe(false);
  });

  it('pairs_with: flags a matching dish next to a base outside the list or without a category, and nothing else', () => {
    const lib = [...library, mk(5, 'base', { name: 'Uncategorised' })];
    const { constraints } = compileRules([record({ template: 'pairs_with', params: { match: oneOf('id', [12, 21]), baseCategories: [RICE] } })], known, TEST_RULE_PARTS);
    const m = buildModel({ library: lib, parts: TEST_RULE_PARTS.list, constraints });
    // Parts in meal order: base, curry, subzi, extras.
    const p = emptyPlan(TEST_RULE_PARTS.list.length);
    p[slotIndex('monday', 'lunch')] = { parts: [[1], [12], [21], []] }; // rice: fine
    p[slotIndex('monday', 'dinner')] = { parts: [[3], [12], [21], []] }; // bread: curry and subzi
    p[slotIndex('tuesday', 'lunch')] = { parts: [[5], [12], [], []] }; // uncategorised: curry
    p[slotIndex('tuesday', 'dinner')] = { parts: [[3], [11], [], []] }; // not matched: fine
    const broken = score(m, p, true).justifications.filter((j) => j.ruleId === 1);
    expect(broken.map((j) => [j.group.day, j.group.meal, j.actual])).toEqual([['monday', 'dinner', 2], ['tuesday', 'lunch', 1]]);
  });

  it('compiles a scoped pairing to a scoped constraint', () => {
    const scope = { days: ['monday' as const], meals: ['lunch' as const] };
    const { constraints, issues } = compileRules([record({ template: 'pairs_with', params: { match: is('id', 12), baseCategories: [RICE], scope, strength: 'prefer', cost: 6 } })], known, TEST_RULE_PARTS);
    expect(issues).toEqual([]);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({ scope });
  });

  it.each(SEEDS)('allowed_days: Chole only on Saturday or Sunday (seed %i)', (seed) => {
    const r = plan([{ template: 'allowed_days', params: { match: is('id', 15), days: ['saturday', 'sunday'] } }], seed);
    expect(hard(r)).toEqual([]);
    for (const s of r.slots.filter((x) => x.curry_id === 15)) expect(['saturday', 'sunday']).toContain(s.day);
  });

  it.each(SEEDS)('curry_category: no lentil curry at dinner (seed %i)', (seed) => {
    const r = plan([{ template: 'exclude', params: { match: is('curry_category', 'lentil'), scope: { meals: ['dinner'] } } }], seed);
    expect(hard(r)).toEqual([]);
    for (const s of r.slots.filter((x) => x.meal_slot === 'dinner')) expect([11, 12]).not.toContain(s.curry_id);
  });

  it.each(SEEDS)('avoid_with: Rasam never in a meal with a lentil curry (seed %i)', (seed) => {
    const r = plan([
      { template: 'avoid_with', params: { match: is('id', 31), with: all(is('componentType', 'curry'), is('curry_category', 'lentil')) } },
      { template: 'require', params: { match: is('id', 31), scope: { meals: ['lunch'] } } },
    ], seed);
    expect(hard(r)).toEqual([]);
    for (const s of r.slots.filter((x) => x.extra_ids.includes(31))) expect([11, 12]).not.toContain(s.curry_id);
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

describe('require_with compilation', () => {
  it('compiles each component to a pair keeping its cost, and each extra category to a slot count', () => {
    const bodies = compileSpec({ template: 'require_with', params: { when: is('id', 12), components: [31], extraCategories: [LIQUID], strength: 'prefer', cost: 6 } });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({ kind: 'pair', of: is('id', 31), strength: 'prefer', cost: 6 });
    expect(bodies[1]).toMatchObject({ kind: 'count', groupBy: 'slot', costs: { min: 6, max: 6 } });
  });

  it('gives a prefer pairing without a cost the default cost, and a must pairing none', () => {
    const [soft] = compileSpec(RuleSpecSchema.parse({ template: 'require_with', params: { when: is('id', 12), components: [31], strength: 'prefer' } }));
    expect(soft).toMatchObject({ kind: 'pair', cost: PREFER_COST });
    const [hardPair] = compileSpec(RuleSpecSchema.parse({ template: 'require_with', params: { when: is('id', 12), components: [31], scope: { meals: ['lunch'] } } }));
    expect(hardPair).toMatchObject({ kind: 'pair', strength: 'must', scope: { meals: ['lunch'] } });
    expect(hardPair).not.toHaveProperty('cost');
  });
});

describe('comes_with compilation', () => {
  it('comes_with compiles to one pair naming its candidates', () => {
    const of = all(is('componentType', 'curry'), oneOf('id', [11, 12]));
    expect(compileSpec(RuleSpecSchema.parse({ template: 'comes_with', params: { match: is('id', 1), of, strength: 'must' } })))
      .toEqual([{ kind: 'pair', when: is('id', 1), of, strength: 'must' }]);
  });

  it('refuses an of that does not pin one kind of dish', () => {
    const parse = (of: unknown) => RuleSpecSchema.safeParse({ template: 'comes_with', params: { match: is('id', 1), of } }).success;
    expect(parse(oneOf('id', [11, 21]))).toBe(false);
    expect(parse(all(oneOf('id', [11]), is('componentType', 'curry')))).toBe(false);
    expect(parse(all(is('componentType', 'curry'), oneOf('id', [11])))).toBe(true);
  });

  it('keeps scope and cost on a preferred pair, and describes it', () => {
    const of = all(is('componentType', 'curry'), oneOf('id', [11, 12]));
    const spec = RuleSpecSchema.parse({ template: 'comes_with', params: { match: is('id', 1), of, scope: { meals: ['lunch'] }, strength: 'prefer', cost: 6 } });
    expect(compileSpec(spec)).toEqual([{ kind: 'pair', when: is('id', 1), of, scope: { meals: ['lunch'] }, strength: 'prefer', cost: 6 }]);
    expect(describeSpec(spec, { component: (id) => ({ 1: 'Idiyappam', 11: 'Stew A', 12: 'Stew B' } as Record<number, string>)[id] }))
      .toBe('With Idiyappam, also one of Stew A or Stew B at lunch (preferred)');
  });
});

describe('comes_with when', () => {
  const of = all(is('componentType', 'extra'), oneOf('id', [16]));
  const base = { match: is('id', 4), of, strength: 'must' as const };
  const parse = (params: object) => RuleSpecSchema.safeParse({ template: 'comes_with', params });
  const both = { curry: [8, 9], subzi: [12] };
  const names = { component: (id: number) => ({ 4: 'Rice', 16: 'Papad', 8: 'Sambar', 9: 'Rasam', 12: 'Beans Poriyal' } as Record<number, string>)[id] };

  it('compiles the condition to one matcher per part, curry first', () => {
    const spec = RuleSpecSchema.parse({ template: 'comes_with', params: { ...base, when: both } });
    expect(compileSpec(spec)).toEqual([{
      kind: 'pair', when: is('id', 4), of, strength: 'must',
      inMeal: [all(is('role', 'curry'), oneOf('id', [8, 9])), all(is('role', 'subzi'), oneOf('id', [12]))],
    }]);
    const subziOnly = RuleSpecSchema.parse({ template: 'comes_with', params: { ...base, when: { subzi: [12] } } });
    expect(compileSpec(subziOnly)[0]).toMatchObject({ inMeal: [all(is('role', 'subzi'), oneOf('id', [12]))] });
  });

  it('emits no inMeal without a condition', () => {
    expect(compileSpec(RuleSpecSchema.parse({ template: 'comes_with', params: base }))[0]).not.toHaveProperty('inMeal');
  });

  it('refuses an empty condition or an empty part', () => {
    expect(parse({ ...base, when: {} }).success).toBe(false);
    expect(parse({ ...base, when: { curry: [] } }).success).toBe(false);
    expect(parse({ ...base, when: { curry: [8] } }).success).toBe(true);
  });

  it('refuses a link that brings a dish into a part it waits for', () => {
    const curries = all(is('componentType', 'curry'), oneOf('id', [11]));
    const subzis = all(is('componentType', 'subzi'), oneOf('id', [12]));
    expect(parse({ ...base, of: curries, when: { subzi: [12] } }).success).toBe(false);
    expect(parse({ ...base, of: subzis, when: { subzi: [12] } }).success).toBe(false);
    expect(parse({ ...base, of: subzis, when: { curry: [8] } }).success).toBe(true);
  });

  it('lists the condition ids as references and describes the condition', () => {
    const spec = RuleSpecSchema.parse({ template: 'comes_with', params: { ...base, when: both } });
    expect(specReferences(spec).components.sort((a, b) => a - b)).toEqual([4, 8, 9, 12, 16]);
    expect(describeSpec(spec, names)).toBe('With Rice, also Papad when the curry is Sambar or Rasam and the subzi is Beans Poriyal');
  });
});

describe('rule template params', () => {
  const valid = (spec: unknown) => RuleSpecSchema.safeParse(spec).success;

  it('fills defaults', () => {
    const parsed = RuleSpecSchema.parse({ template: 'no_repeat', params: { match: is('componentType', 'curry') } });
    expect(parsed).toEqual({ template: 'no_repeat', params: { match: is('componentType', 'curry'), within: 'week', strength: 'must' } });
  });

  it('groups every rule type exactly once, for the type picker', () => {
    expect(TEMPLATE_GROUPS.map((g) => g.label)).toEqual(['Where and when', 'Keep out', 'Pair and require', 'Count and spread', 'Preference']);
    expect(OWNED_ONLY_TEMPLATES).toEqual(['comes_with']);
    expect(TEMPLATE_GROUPS.flatMap((g) => g.templates).sort())
      .toEqual(TEMPLATE_IDS.filter((t) => !OWNED_ONLY_TEMPLATES.includes(t)).sort());
  });

  it('accepts a prefer weight up to 10 and no more', () => {
    expect(valid({ template: 'prefer', params: { match: is('id', 1), direction: 'prefer', weight: 10 } })).toBe(true);
    expect(valid({ template: 'prefer', params: { match: is('id', 1), direction: 'prefer', weight: 11 } })).toBe(false);
  });

  it('rejects incomplete or contradictory params', () => {
    expect(valid({ template: 'limit', params: { match: is('role', 'curry'), per: 'week' } })).toBe(false);
    expect(valid({ template: 'limit', params: { match: is('role', 'curry'), per: 'week', min: 3, max: 2 } })).toBe(false);
    expect(valid({ template: 'require_with', params: { when: is('id', 1) } })).toBe(false);
    expect(valid({ template: 'only_allow', params: { match: is('id', 1), parts: [] } })).toBe(false);
    expect(valid({ template: 'skip_when', params: { when: is('id', 1), skip: [] } })).toBe(false);
    expect(valid({ template: 'no_repeat', params: { match: is('id', 1), parts: [] } })).toBe(false);
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
    expect(d({ template: 'pairs_with', params: { match: is('id', 12), baseCategories: [RICE] } })).toBe('Sambar only with Rice bases');
    expect(d({ template: 'pairs_with', params: { match: is('id', 12), baseCategories: [RICE], scope: { days: ['monday'], meals: ['lunch'] } } }))
      .toBe('Sambar only with Rice bases on Monday at lunch');
    expect(RuleSpecSchema.safeParse({ template: 'pairs_with', params: { match: is('id', 12), baseCategories: [] } }).success).toBe(false);
    expect(d({ template: 'prefer', params: { match: is('protein_tag', 'fish'), direction: 'avoid', weight: 1 } })).toBe('Avoid dishes with fish (slightly)');
    expect(d({ template: 'prefer', params: { match: is('protein_tag', 'fish'), direction: 'prefer', weight: 5 } })).toBe('Prefer dishes with fish (strongly)');
    expect(d({ template: 'allowed_days', params: { match: is('id', 15), days: ['saturday', 'sunday'] } })).toBe('Chole only on Saturday or Sunday');
    expect(d({ template: 'avoid_with', params: { match: is('id', 31), with: all(is('componentType', 'curry'), oneOf('curry_category', ['soup', 'lentil'])) } }))
      .toBe('Rasam never with soup or lentil curries');
  });
});

describe('descriptions over parts', () => {
  // The converted parts (Base, Curry, Subzi, Extras: ids 1 to 4) and their categories, as stored: the curry types are
  // categories of the Curry part, read before the noun.
  const PART: Record<number, string> = { 1: 'Base', 2: 'Curry', 3: 'Subzi', 4: 'Extras' };
  const CATEGORY: Record<number, string> = { 10: 'Rice-based', 30: 'Liquid', 21: 'lentil', 22: 'legume' };
  const names = {
    component: (id: number) => ({ 1: 'Sambar', 2: 'Rasam' } as Record<number, string>)[id],
    baseCategory: (id: number) => CATEGORY[id],
    extraCategory: (id: number) => CATEGORY[id],
    part: (id: number) => PART[id],
    category: (id: number) => CATEGORY[id],
    categoryIsType: (id: number) => id === 21 || id === 22,
  };
  const d = (spec: unknown) => describeSpec(RuleSpecSchema.parse(spec), names);

  // [today's sentence, today's stored spec (undefined when its params no longer parse), the new-shape twin]
  const TWINS: [string, unknown, unknown][] = [
    ['Never include lentil curries with fish on Friday',
      { template: 'exclude', params: { match: all(is('componentType', 'curry'), is('curry_category', 'lentil'), is('protein_tag', 'fish')), scope: { days: ['friday'] } } },
      { template: 'exclude', params: { match: all(is('part', 2), is('category', 21), is('protein_tag', 'fish')), scope: { days: ['friday'] } } }],
    ['Curries and subzis: only south-indian dishes', undefined,
      { template: 'only_allow', params: { match: is('regional_tags', 'south-indian'), parts: [2, 3] } }],
    ['Curries at lunch: only Sambar (preferred)', undefined,
      { template: 'only_allow', params: { match: is('id', 1), parts: [2], scope: { meals: ['lunch'] }, strength: 'prefer' } }],
    ['Always include at least 2 extras at breakfast',
      { template: 'require', params: { match: is('componentType', 'extra'), min: 2, scope: { meals: ['breakfast'] } } },
      { template: 'require', params: { match: is('part', 4), min: 2, scope: { meals: ['breakfast'] } } }],
    ['Bases in the Rice-based category: at most 3 per week',
      { template: 'limit', params: { match: all(is('componentType', 'base'), is('base_category_id', 10)), per: 'week', max: 3 } },
      { template: 'limit', params: { match: all(is('part', 1), is('category', 10)), per: 'week', max: 3 } }],
    ['Dishes except extras: at most 3 per meal',
      { template: 'limit', params: { match: not(is('componentType', 'extra')), per: 'meal', max: 3 } },
      { template: 'limit', params: { match: not(is('part', 4)), per: 'meal', max: 3 } }],
    ["Don't repeat subzis within 3 days", undefined,
      { template: 'no_repeat', params: { match: is('part', 3), parts: [3], within: 3 } }],
    ["Don't repeat bases, curries or subzis in the week (preferred)", undefined,
      { template: 'no_repeat', params: { match: oneOf('part', [1, 2, 3]), strength: 'prefer', cost: 2 } }],
    ['Extras in the Liquid category only at lunch',
      { template: 'allowed_meals', params: { match: all(is('componentType', 'extra'), is('extra_category_id', 30)), meals: ['lunch'] } },
      { template: 'allowed_meals', params: { match: all(is('part', 4), is('category', 30)), meals: ['lunch'] } }],
    ['With Sambar, no subzis and extras', undefined,
      { template: 'skip_when', params: { when: is('id', 1), skip: [3, 4] } }],
    ['With lentil dishes, no curries on Monday', undefined,
      { template: 'skip_when', params: { when: is('category', 21), skip: [2], scope: { days: ['monday'] } } }],
    ['Curries or subzis only on Saturday or Sunday',
      { template: 'allowed_days', params: { match: oneOf('componentType', ['curry', 'subzi']), days: ['saturday', 'sunday'] } },
      { template: 'allowed_days', params: { match: oneOf('part', [2, 3]), days: ['saturday', 'sunday'] } }],
    ['Avoid curries that are not lentil (strongly)',
      { template: 'prefer', params: { match: all(is('componentType', 'curry'), not(is('curry_category', 'lentil'))), direction: 'avoid', weight: 5 } },
      { template: 'prefer', params: { match: all(is('part', 2), not(is('category', 21))), direction: 'avoid', weight: 5 } }],
    ['Never include lentil or legume dishes',
      { template: 'exclude', params: { match: oneOf('curry_category', ['lentil', 'legume']) } },
      { template: 'exclude', params: { match: oneOf('category', [21, 22]) } }],
  ];

  it.each(TWINS)('"%s" reads the same over parts', (sentence, old, twin) => {
    expect(d(twin)).toBe(sentence);
    if (old !== undefined) expect(d(old)).toBe(sentence);
  });

  it('names a part or category it cannot find by id', () => {
    expect(describeSpec(RuleSpecSchema.parse({ template: 'exclude', params: { match: all(is('part', 9), is('category', 8)) } })))
      .toBe('Never include part #9 in the category #8 category');
  });
});
