// Task 1 of rule levels: `level` must say exactly what `yieldsTo` says, for every rule the case library uses.
import { describe, expect, it } from 'vitest';
import { compileRules, defaultRules, type KnownIds, type RuleRecord } from '@/rules';
import { ALL_CASES } from './cases';
import { libraryOf, TEST_LIBRARY } from './library';
import { recordsOf } from './run';

const CREATED = '2026-01-01T00:00:00.000Z';

function check(records: RuleRecord[], lib: typeof TEST_LIBRARY): number {
  const known: KnownIds = {
    components: new Set(lib.dishes.map((d) => d.id)),
    baseCategories: new Set(lib.categories.filter((k) => k.kind === 'base').map((k) => k.id)),
    extraCategories: new Set(lib.categories.filter((k) => k.kind === 'extra').map((k) => k.id)),
  };
  const { constraints, issues } = compileRules(records, known);
  expect(issues).toEqual([]);
  for (const c of constraints) {
    if (c.kind === 'pair') {
      expect(c, c.id).not.toHaveProperty('level');
      continue;
    }
    const expected = c.yieldsTo === 'unit' ? 'dish' : c.yieldsTo === 'ask' ? 'frequency' : 'rule';
    expect(c.level ?? 'rule', c.id).toBe(expected);
  }
  return constraints.length;
}

describe('level agrees with yieldsTo', () => {
  it('for every rule of every case, and the defaults', () => {
    let total = check(defaultRules().map((r, i) => ({ ...r, id: i + 1, enabled: true, created_at: CREATED })), TEST_LIBRARY);
    for (const c of ALL_CASES) {
      const lib = c.dishes?.length ? libraryOf([...TEST_LIBRARY.dishes, ...c.dishes], TEST_LIBRARY.categories) : TEST_LIBRARY;
      total += check(recordsOf(c, c.rules(lib), c.given?.(lib) ?? []), lib);
    }
    expect(total).toBeGreaterThan(100);
  });
});
