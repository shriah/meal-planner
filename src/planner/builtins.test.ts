import { describe, expect, it } from 'vitest';
import { builtinConstraints } from './builtins';
import { compileModel, score } from './scorer';
import { component, slotOf, TEST_PARTS } from './test-utils';
import { emptyPlan, slotIndex } from './types';

describe('built-in constraints', () => {
  it('reports structural problems in locked slots (wrong part, missing first-part dish, a dish twice)', () => {
    const library = [component('base', { id: 1 }), component('curry', { id: 2 }), component('extra', { id: 3 })];
    const m = compileModel(library, builtinConstraints(TEST_PARTS), TEST_PARTS);
    const plan = emptyPlan(TEST_PARTS.length);
    plan[slotIndex('monday', 'lunch')] = slotOf({ base: 2, extras: [3, 3] });
    const ids = score(m, plan, true).justifications.filter((j) => j.level === 'hard').map((j) => j.constraintId);
    expect(ids).toContain('builtin:wrong-part');
    expect(ids).toContain('builtin:one-dish-first-part'); // the other 20 slots have no base
    expect(ids).toContain('builtin:dish-twice');
  });

  // One curry and one subzi per meal are stored rules (`capRules`), which the user can edit.
  it('are only the structure of a meal, worded by the first part', () => {
    const builtins = builtinConstraints(TEST_PARTS);
    expect(builtins.map((c) => c.id)).toEqual([
      'builtin:one-dish-first-part', 'builtin:wrong-part', 'builtin:dish-twice',
    ]);
    expect(builtins[0].label).toBe('Each meal needs exactly one base');
  });
});
