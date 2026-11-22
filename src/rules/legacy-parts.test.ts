import { describe, expect, it } from 'vitest';
import { all, is, oneOf, type Constraint, type Matcher } from '@/planner';
import { constraintOverParts, toPartMatcher } from './legacy-parts';
import { TEST_RULE_PARTS } from './test-parts';

const { legacy } = TEST_RULE_PARTS;

describe('toPartMatcher', () => {
  it('rewrites a component type list to the part ids', () => {
    expect(toPartMatcher(oneOf('componentType', ['base', 'curry']), legacy)).toEqual(oneOf('part', [1, 2]));
  });

  it('rewrites a role to its part, and neq keeps its op', () => {
    expect(toPartMatcher(is('role', 'extra'), legacy)).toEqual(is('part', 4));
    expect(toPartMatcher({ field: 'role', op: 'neq', value: 'curry' }, legacy)).toEqual({ field: 'part', op: 'neq', value: 2 });
  });

  it('leaves other leaves alone and rewrites inside all, any and not', () => {
    expect(toPartMatcher(is('day', 'monday'), legacy)).toEqual(is('day', 'monday'));
    const m: Matcher = { not: { any: [all(is('componentType', 'subzi'), is('day', 'friday'))] } };
    expect(toPartMatcher(m, legacy)).toEqual({ not: { any: [all(is('part', 3), is('day', 'friday'))] } });
  });
});

describe('constraintOverParts', () => {
  const common = { id: 'x', label: 'x', origin: 'rule' as const };

  it('rewrites every matcher a count, prefer or pair constraint holds', () => {
    const count: Constraint = {
      ...common, kind: 'count', select: is('role', 'curry'), groupBy: 'meal', bounds: { hardMax: 1 },
      when: { exists: is('componentType', 'base') },
    };
    expect(constraintOverParts(count, legacy)).toEqual({ ...count, select: is('part', 2), when: { exists: is('part', 1) } });

    const prefer: Constraint = { ...common, kind: 'prefer', select: is('componentType', 'extra'), weight: 1 };
    expect(constraintOverParts(prefer, legacy)).toEqual({ ...prefer, select: is('part', 4) });

    const pair: Constraint = {
      ...common, kind: 'pair', when: is('componentType', 'curry'), of: is('componentType', 'extra'), strength: 'must',
      inMeal: [is('componentType', 'subzi'), is('id', 5)],
    };
    expect(constraintOverParts(pair, legacy)).toEqual({ ...pair, when: is('part', 2), of: is('part', 4), inMeal: [is('part', 3), is('id', 5)] });
  });
});
