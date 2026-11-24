import { describe, expect, it } from 'vitest';
import { everyMealHasInPart, everyMealWith, partDishes, plannedAtLeast, lockedMealKept, neverAt, nearNoRulesCount, noHardProblems, someMealWith } from './expect';
import { capped, compileModel, is, type Constraint } from '@/planner';
import { capConstraints } from '@/planner/test-utils';
import { compileRules, exclusionRule, mealRule } from '@/rules';
import { legacyPartIds } from '@/db/parts';
import { libraryOf, TEST_LIBRARY } from './library';
import type { PartSlot } from '@/planner';
import type { ComponentRecord } from '@/types/component';
import { seededLibrary } from './seeded-library';
import { failsWithoutSubject, knownIds, recordsOf, rulePartsOf, runPlanCase, statusOf } from './run';
import type { CaseRule, CaseWeeks, PlanCase } from './types';

const weeks = (lib = TEST_LIBRARY): CaseWeeks => ({ weeks: [[]], hard: [[]], soft: [[]], suppressed: [[]], lib });
/** Weeks where Pongal is planned `n` times in total. */
const withPongal = (n: number): CaseWeeks => {
  const id = TEST_LIBRARY.dish('Pongal').id;
  const slots = Array.from({ length: n }, () => ({ day: 'monday' as const, meal_slot: 'breakfast' as const, base_id: id, extra_ids: [] }));
  return { weeks: [slots], hard: [[]], soft: [[]], suppressed: [[]], lib: TEST_LIBRARY };
};

describe('TEST_LIBRARY', () => {
  it('has 18 dishes with unique ids under 900', () => {
    const ids = TEST_LIBRARY.dishes.map((d) => d.id);
    expect(ids).toHaveLength(18);
    expect(new Set(ids).size).toBe(18);
    expect(Math.max(...ids)).toBeLessThan(900);
  });
  it('knows Pongal as a Rice-based base', () => {
    const pongal = TEST_LIBRARY.dish('Pongal');
    expect(pongal.componentType).toBe('base');
    expect(pongal.base_category_id).toBe(TEST_LIBRARY.category('Rice-based').id);
  });
});

describe('library dishes carry their part', () => {
  it('gives every dish the part of its type, and the library its four parts', () => {
    const ids = legacyPartIds(TEST_LIBRARY.parts);
    expect(TEST_LIBRARY.parts.map((p) => [p.id, p.name, p.varied])).toEqual([
      [1, 'Base', true], [2, 'Curry', true], [3, 'Subzi', true], [4, 'Extras', false],
    ]);
    for (const d of TEST_LIBRARY.dishes) expect(d.part_id, d.name).toBe(ids[d.componentType]);
  });
  it('gives categories and tags from the old fields', () => {
    expect(TEST_LIBRARY.dish('Pongal').category_id).toBe(TEST_LIBRARY.category('Rice-based').id);
    expect(TEST_LIBRARY.dish('Pickle').category_id).toBe(TEST_LIBRARY.category('Condiments').id);
    expect(TEST_LIBRARY.dish('Sambar').category_id).toBe(TEST_LIBRARY.category('lentil').id);
    expect(TEST_LIBRARY.dish('Beans Poriyal').category_id).toBeUndefined();
    expect(TEST_LIBRARY.dish('Pongal').tags).toEqual({ 1: [1], 2: [], 3: [], 4: [] });
  });
  it('converts case-only dishes and the seeded library too', () => {
    const lib = libraryOf([{ ...TEST_LIBRARY.dish('Dal'), id: 900, name: 'Extra Dal' }], { categories: TEST_LIBRARY.categories });
    expect(lib.dish('Extra Dal').part_id).toBe(2);
    const ids = legacyPartIds(TEST_LIBRARY.parts);
    for (const d of seededLibrary()) expect(d.part_id, d.name).toBe(ids[d.componentType]);
  });
});

describe('expectations', () => {
  it('everyMealWith fails when no meal has the dish', () => {
    expect(everyMealWith('Pongal', ['Sambar']).check(weeks(), { baseline: weeks })).toEqual({ pass: false, got: '0 of 0' });
  });
  it('nearNoRulesCount compares with the baseline', () => {
    const near = nearNoRulesCount('Pongal');
    expect(near.check(withPongal(6), { baseline: () => withPongal(8) }).pass).toBe(true);
    expect(near.check(withPongal(13), { baseline: () => withPongal(8) }).pass).toBe(false);
    expect(near.check(withPongal(4), { baseline: () => withPongal(2) }).pass).toBe(true);
  });
});

describe('statusOf', () => {
  it('reads known issues', () => {
    expect(statusOf(true, 'x')).toBe('known-now-passes');
    expect(statusOf(false, 'x')).toBe('known');
    expect(statusOf(false)).toBe('fail');
    expect(statusOf(true)).toBe('pass');
  });
});

describe('runPlanCase', () => {
  it('plans a case with no rules', () => {
    const r = runPlanCase({ kind: 'plan', id: 'empty', group: 'Extras', name: 'Empty', why: 'x', rules: () => [], expect: [noHardProblems()] });
    expect(r.status).toBe('pass');
    expect(r.sampleWeek).toHaveLength(21);
  });
  it('fails a case whose rule could not be applied', () => {
    const r = runPlanCase({
      kind: 'plan', id: 'ghost', group: 'Extras', name: 'Ghost', why: 'x',
      rules: () => [mealRule({ id: 999, name: 'Ghost' }, ['lunch'])], expect: [noHardProblems()],
    });
    expect(r.status).toBe('fail');
    expect(r.expectations[0]).toMatchObject({ says: expect.stringContaining('Rule could not be applied'), pass: false });
  });
});

describe('recordsOf', () => {
  const base = { kind: 'plan' as const, id: 'c', group: 'Extras' as const, name: 'C', why: 'x', rules: () => [], expect: [] };
  it('leaves the defaults out for a defaults: false case, baseline included; the caps stay, as the built-ins did', () => {
    expect(recordsOf({ ...base, defaults: false }, []).map((r) => r.name)).toEqual(['At most one Curry per meal', 'At most one Subzi per meal']);
    expect(recordsOf(base, []).length).toBeGreaterThan(2);
  });
  it('puts the curry and subzi caps after the defaults, and drops one by cap:curry or cap:subzi', () => {
    const names = (drop: string[] = []) => recordsOf(base, [], [], drop).map((r) => r.name);
    expect(names().slice(-2)).toEqual(['At most one Curry per meal', 'At most one Subzi per meal']);
    expect(names(['cap:curry']).filter((n) => n.startsWith('At most one'))).toEqual(['At most one Subzi per meal']);
    expect(names(['cap:subzi']).filter((n) => n.startsWith('At most one'))).toEqual(['At most one Curry per meal']);
  });
  it('compiles the caps to what capConstraints builds, and the planner caps the Curry and Subzi parts', () => {
    const { constraints, issues } = compileRules(recordsOf(base, []), knownIds(TEST_LIBRARY), rulePartsOf(TEST_LIBRARY));
    expect(issues).toEqual([]);
    const caps = constraints.filter((c) => c.label.startsWith('At most one'));
    // Apart from what names the constraint.
    const shape = (c: Constraint) => Object.fromEntries(Object.entries(c).filter(([k]) => !['id', 'label', 'ruleId'].includes(k)));
    expect(caps.map(shape)).toEqual(capConstraints(TEST_LIBRARY.parts).map(shape));
    expect(caps.map((c) => c.label)).toEqual(capConstraints(TEST_LIBRARY.parts).map((c) => c.label));
    expect([...capped(compileModel(TEST_LIBRARY.dishes, constraints, TEST_LIBRARY.parts))]).toEqual([2, 3]);
  });
  it('orders own rules, then given ones, then the defaults less those dropped', () => {
    const own = mealRule(TEST_LIBRARY.dish('Dal'), ['lunch']);
    const given = exclusionRule(TEST_LIBRARY.dish('Chole'));
    const records = recordsOf(base, [own], [given], ['spacing']);
    expect(records.slice(0, 2).map((r) => [r.id, r.name])).toEqual([[1, own.name], [2, given.name]]);
    expect(records.some((r) => r.default_key === 'spacing')).toBe(false);
    expect(records.some((r) => r.default_key === 'variety')).toBe(true);
  });
});

describe('failsWithoutSubject', () => {
  const dal = TEST_LIBRARY.dish('Dal');
  const lunchOnly: PlanCase = {
    kind: 'plan', id: 's', group: 'Days and meals', name: 'S', why: 'x',
    rules: () => [mealRule(dal, ['lunch'])],
    given: () => [{ name: 'A curry at every meal', spec: { template: 'require', params: { match: is('componentType', 'curry'), min: 1, strength: 'must' } } }],
    expect: [neverAt('Dal', { meals: ['breakfast', 'dinner'] })],
  };
  it('fails a case once its own rules are taken away, keeping the given ones', () => {
    expect(runPlanCase(lunchOnly).status).toBe('pass');
    expect(failsWithoutSubject(lunchOnly)).toEqual({ fails: true, passing: [] });
  });
  it('names the expectations that pass anyway', () => {
    const r = failsWithoutSubject({ ...lunchOnly, expect: [noHardProblems()] });
    expect(r).toEqual({ fails: false, passing: ['No hard rule is broken'] });
  });
  it('takes the pins away too', () => {
    const lock: PlanCase = {
      ...lunchOnly, rules: () => [],
      pins: { 'monday-lunch': { curry_id: TEST_LIBRARY.dish('Chole').id } },
      expect: [lockedMealKept('monday-lunch', 'curry', 'Chole')],
    };
    expect(runPlanCase(lock).status).toBe('pass');
    expect(failsWithoutSubject(lock).fails).toBe(true);
  });
});

describe('wording', () => {
  it('uses "or" for neverAt and singular meals', () => {
    expect(neverAt('Dal', { meals: ['breakfast', 'dinner'] }).says).toBe('Dal is never planned at breakfast or dinner');
    const slot = { day: 'monday' as const, meal_slot: 'breakfast' as const, base_id: TEST_LIBRARY.dish('Dal').id, extra_ids: [] };
    const one: CaseWeeks = { weeks: [[slot]], hard: [[]], soft: [[]], suppressed: [[]], lib: TEST_LIBRARY };
    expect(neverAt('Dal', { meals: ['breakfast'] }).check(one, { baseline: () => one }).got).toBe('1 meal');
    expect(neverAt('Dal', { meals: ['lunch'] }).check(one, { baseline: () => one }).got).toBe('0 meals');
  });
  it('capitalises the locked meal', () => {
    expect(lockedMealKept('monday-breakfast', 'curry', 'Dal').says).toBe('The locked Monday breakfast keeps Dal as its curry');
  });
});

describe('failing seed and highlights', () => {
  it('points at the first week that breaks the expectation', () => {
    const dal = TEST_LIBRARY.dish('Dal').id;
    const ok = { day: 'monday' as const, meal_slot: 'lunch' as const, base_id: dal, extra_ids: [] };
    const bad = { ...ok, meal_slot: 'dinner' as const };
    const w: CaseWeeks = { weeks: [[ok], [ok], [bad]], hard: [[], [], []], soft: [[], [], []], suppressed: [[], [], []], lib: TEST_LIBRARY };
    expect(neverAt('Dal', { meals: ['dinner'] }).failingSeed?.(w, { baseline: () => w })).toBe(2);
    expect(neverAt('Dal', { meals: ['breakfast'] }).failingSeed?.(w, { baseline: () => w })).toBeUndefined();
  });
  it('neverAt highlights the dish wherever it is planned', () => {
    const e = neverAt('Dal', { meals: ['breakfast', 'dinner'] });
    const slot = { day: 'monday' as const, meal_slot: 'lunch' as const, base_id: TEST_LIBRARY.dish('Dal').id, extra_ids: [] };
    expect(e.highlights?.(slot, TEST_LIBRARY)).toBe(true);
    expect(e.highlights?.({ ...slot, base_id: TEST_LIBRARY.dish('Idli').id }, TEST_LIBRARY)).toBe(false);
  });
  it('someMealWith needs a meal at those times to have the pairing', () => {
    const p = TEST_LIBRARY.dish('Pongal').id;
    const s = TEST_LIBRARY.dish('Sambar').id;
    const at = (meal_slot: 'breakfast' | 'lunch', curry?: number) => ({ day: 'monday' as const, meal_slot, base_id: p, curry_id: curry, extra_ids: [] });
    const e = someMealWith('Pongal', ['Sambar'], ['breakfast', 'dinner']);
    const run = (slots: ReturnType<typeof at>[]) => e.check({ weeks: [slots], hard: [[]], soft: [[]], suppressed: [[]], lib: TEST_LIBRARY }, { baseline: weeks }).pass;
    expect(run([at('lunch', s)])).toBe(false);
    expect(run([at('breakfast', s)])).toBe(true);
  });
  it('a failing case shows the first failing seed, a passing one seed 1', () => {
    const fails = runPlanCase({
      kind: 'plan', id: 'f', group: 'Extras', name: 'F', why: 'x', rules: () => [],
      expect: [neverAt('Pongal', { meals: ['breakfast', 'lunch', 'dinner'] })],
    });
    expect(fails.status).toBe('fail');
    expect(fails.sampleSeed).toBeGreaterThanOrEqual(1);
    expect(fails.sampleWeek?.some((x) => x.highlight)).toBe(true);
    const passes = runPlanCase({ kind: 'plan', id: 'p', group: 'Extras', name: 'P', why: 'x', rules: () => [], expect: [noHardProblems()] });
    expect(passes.sampleSeed).toBe(1);
  });
});

describe('neverAt', () => {
  it('needs meals or days', () => {
    expect(() => neverAt('Pongal', {})).toThrow();
  });
});

describe('cases on a library with its own parts', () => {
  // Ids out of position order: nothing may lean on a part's id to find its place.
  const MAIN = 7;
  const SIDE = 3;
  const DESSERT = 5;
  const dish = (id: number, name: string, part_id: number): ComponentRecord & { part_id: number } => ({
    id, name, componentType: 'base', part_id, dietary_tags: ['veg'], regional_tags: [], occasion_tags: [], frequency: 'normal', created_at: '',
  });
  const library = libraryOf(
    [dish(1, 'Biryani', MAIN), dish(11, 'Raita', SIDE), dish(12, 'Salan', SIDE), dish(21, 'Kheer', DESSERT)],
    { parts: [{ id: MAIN, name: 'Main', varied: true }, { id: SIDE, name: 'Side', varied: true }, { id: DESSERT, name: 'Dessert', varied: false }] },
  );
  const trivial: PlanCase = {
    kind: 'plan', id: 'parts-trivial', group: 'Extras', name: 'Trivial', why: 'x', library, defaults: false,
    rules: () => [], expect: [everyMealHasInPart(MAIN, [1])],
  };

  it('plans part-keyed weeks: one Main in each meal, no Sides or Desserts without a rule', () => {
    const r = runPlanCase(trivial);
    expect(r.status).toBe('pass');
    expect(r.sampleWeek).toHaveLength(21);
    const slot = r.sampleWeek![0].slot as PartSlot;
    expect(partDishes(slot, MAIN)).toHaveLength(1);
    expect(partDishes(slot, SIDE)).toEqual([]);
    expect(r.sampleWeek![0].text).toBe('Main: Biryani');
  });
  it('names the part in the expectation sentence and fails when a meal lacks the dish', () => {
    expect(everyMealHasInPart(MAIN, [1]).says).toBe('Every meal has dish 1 in part 7');
    const w: CaseWeeks = {
      weeks: [[]], hard: [[]], soft: [[]], suppressed: [[]], lib: library,
      parts: [[{ day: 'monday', meal_slot: 'lunch', parts: { [MAIN]: [1], [SIDE]: [], [DESSERT]: [] } }]],
    };
    expect(everyMealHasInPart(SIDE, [11]).check(w, { baseline: () => w })).toEqual({ pass: false, got: '0 of 1' });
  });
  it('names the part by its given name in the sentence', () => {
    expect(everyMealHasInPart(SIDE, [11, 12], 'Side').says).toBe('Every meal has dishes 11 and 12 in Side');
  });
  it('plans with the default rules over its own parts: no extras limits or caps, sides left out unless asked', () => {
    const withDefaults: PlanCase = { ...trivial, defaults: undefined };
    expect(recordsOf(withDefaults, []).map((r) => r.default_key)).toEqual(['variety', 'spacing', 'sides-only-when-asked', 'prefer-frequent', 'avoid-rare']);
    const r = runPlanCase(withDefaults);
    expect(r.status).toBe('pass');
    expect(r.defaults).toBe(true);
    for (const meal of r.sampleWeek!) {
      expect(partDishes(meal.slot as PartSlot, SIDE)).toEqual([]);
      expect(partDishes(meal.slot as PartSlot, DESSERT)).toEqual([]);
    }
  });
  it('reads no converted-shape expectation', () => {
    const w: CaseWeeks = { weeks: [[]], hard: [[]], soft: [[]], suppressed: [[]], lib: library, parts: [[]] };
    expect(() => plannedAtLeast('Biryani', 1).check(w, { baseline: () => w })).toThrow(/converted shape/);
  });
  it('lists a referenced custom dish by its part name', () => {
    const limit = { name: 'One Biryani', spec: { template: 'limit', params: { match: is('id', 1), per: 'meal', max: 1, strength: 'must' } } } as CaseRule;
    expect(runPlanCase({ ...trivial, rules: () => [limit] }).dishes).toEqual([{ name: 'Biryani', type: 'Main' }]);
  });

  describe('expected rule issues', () => {
    // A rule over a component type cannot be read on parts that are not the converted four: it is skipped and named.
    const oldRule = () => [{ name: 'Old shape', spec: { template: 'limit', params: { match: is('componentType', 'base'), per: 'meal', max: 1, strength: 'must' } } } as CaseRule];
    const withRule: PlanCase = { ...trivial, rules: oldRule };
    it('fails the case for a skipped rule it did not expect', () => {
      const r = runPlanCase(withRule);
      expect(r.status).toBe('fail');
      expect(r.expectations[0]).toMatchObject({ says: 'Rule could not be applied: Old shape', pass: false });
    });
    it('passes when the issue is listed, and fails when a listed issue does not happen', () => {
      expect(runPlanCase({ ...withRule, issues: ['Old shape: names the field'] }).status).toBe('pass');
      const missing = runPlanCase({ ...trivial, issues: ['Old shape'] });
      expect(missing.status).toBe('fail');
      expect(missing.expectations[0]).toMatchObject({ says: 'Rule issue expected: Old shape', pass: false, got: 'no rule issue' });
    });
    it('still fails an issue the listed texts do not match', () => {
      expect(runPlanCase({ ...withRule, issues: ['something else'] }).status).toBe('fail');
    });
  });
});
