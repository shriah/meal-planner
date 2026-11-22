// Rule levels, compiled from stored-style rules: every rule of every case, and the defaults, lands on a level.
import { describe, expect, it } from 'vitest';
import { compileRules, defaultRules, ruleLevel, type KnownIds, type RuleRecord } from '@/rules';
import type { RuleLevel } from '@/planner';
import { ALL_CASES } from './cases';
import { libraryOf, TEST_LIBRARY } from './library';
import { knownIds, recordsOf, rulePartsOf } from './run';

const CREATED = '2026-01-01T00:00:00.000Z';
const LEVELS: RuleLevel[] = ['rule', 'dish', 'frequency'];

function check(records: RuleRecord[], lib: typeof TEST_LIBRARY): number {
  const known: KnownIds = knownIds(lib);
  const byRule = new Map(records.map((r) => [r.id, r]));
  const { constraints, issues } = compileRules(records, known, rulePartsOf(lib));
  expect(issues).toEqual([]);
  for (const c of constraints) {
    if (c.kind === 'pair') {
      expect(c, c.id).not.toHaveProperty('level');
      continue;
    }
    expect(LEVELS, c.id).toContain(c.level);
    const rule = byRule.get(c.ruleId ?? -1);
    // An owned rule sits on the dish level unless it is a frequency rule; the minimum half of a split
    // frequency count (it has a `:max` sibling) is `rule` by design.
    const isMin = constraints.some((o) => o.id === `${c.id}:max`);
    if (rule?.owner_component_id !== undefined && !isMin) expect(c.level, c.id).not.toBe('rule');
    // A frequency constraint is a preference or a non-slot count with an upper bound.
    if (c.level === 'frequency') {
      const upper = c.kind === 'count' && c.groupBy !== 'slot' && (c.bounds.hardMax !== undefined || c.bounds.softMax !== undefined);
      expect(c.kind === 'prefer' || upper, c.id).toBe(true);
    }
  }
  return constraints.length;
}

describe('rule levels', () => {
  it('every constraint of every case rule, and the defaults, has a level', () => {
    let total = check(defaultRules(TEST_LIBRARY.parts).map((r, i) => ({ ...r, id: i + 1, enabled: true, created_at: CREATED })), TEST_LIBRARY);
    for (const c of ALL_CASES) {
      const lib = c.dishes?.length ? libraryOf([...TEST_LIBRARY.dishes, ...c.dishes], { categories: TEST_LIBRARY.categories }) : TEST_LIBRARY;
      total += check(recordsOf(c, c.rules(lib), c.given?.(lib) ?? []), lib);
    }
    expect(total).toBeGreaterThan(100);
  });

  it('defaults sit on the level their key names', () => {
    const lib = TEST_LIBRARY;
    const known: KnownIds = knownIds(lib);
    const records = defaultRules(TEST_LIBRARY.parts).map((r, i) => ({ ...r, id: i + 1, enabled: true, created_at: CREATED }));
    const { constraints } = compileRules(records, known, rulePartsOf(lib));
    const levelsOf = (key: string): (RuleLevel | undefined)[] => {
      const ids = records.filter((r) => r.default_key === key).map((r) => r.id);
      return constraints.flatMap((c) => (c.kind !== 'pair' && ids.includes(c.ruleId ?? -1) ? [c.level] : []));
    };
    for (const key of ['variety', 'spacing', 'sides-only-when-asked', 'prefer-frequent', 'avoid-rare']) {
      expect(levelsOf(key), key).not.toEqual([]);
      for (const l of levelsOf(key)) expect(l, key).toBe('frequency');
    }
    for (const key of ['extras-limit-breakfast', 'extras-limit-lunch', 'extras-limit-dinner']) {
      expect(levelsOf(key), key).not.toEqual([]);
      for (const l of levelsOf(key)) expect(l, key).toBe('dish');
    }
  });

  it('the Rules page badge is `bring` iff a pair compiles, else the strongest compiled level', () => {
    const STRENGTH = { rule: 0, dish: 1, frequency: 2 };
    let checked = 0;
    const verify = (records: RuleRecord[], lib: typeof TEST_LIBRARY) => {
      const known: KnownIds = knownIds(lib);
      for (const r of records) {
        const { constraints } = compileRules([{ ...r, enabled: true }], known, rulePartsOf(lib));
        if (constraints.length === 0) continue;
        const pair = constraints.some((c) => c.kind === 'pair');
        const levels = constraints.flatMap((c) => (c.kind === 'pair' ? [] : [c.level!]));
        const strongest = levels.sort((a, b) => STRENGTH[b] - STRENGTH[a])[0];
        expect(ruleLevel(r), r.name).toBe(pair ? 'bring' : strongest);
        checked++;
      }
    };
    verify(defaultRules(TEST_LIBRARY.parts).map((r, i) => ({ ...r, id: i + 1, enabled: true, created_at: CREATED })), TEST_LIBRARY);
    for (const c of ALL_CASES) {
      const lib = c.dishes?.length ? libraryOf([...TEST_LIBRARY.dishes, ...c.dishes], { categories: TEST_LIBRARY.categories }) : TEST_LIBRARY;
      verify(recordsOf(c, c.rules(lib), c.given?.(lib) ?? []), lib);
    }
    expect(checked).toBeGreaterThan(100);
  });
});
