import { describe, expect, it } from 'vitest';
import { builtinConstraints } from './builtins';
import { compileModel, score } from './scorer';
import { component } from './test-utils';
import { emptyPlan, slotIndex } from './types';

describe('built-in constraints', () => {
  it('reports structural problems in locked slots (wrong role, missing base)', () => {
    const library = [component('base', { id: 1 }), component('curry', { id: 2 })];
    const m = compileModel(library, builtinConstraints());
    const plan = emptyPlan();
    plan[slotIndex('monday', 'lunch')] = { base: 2, extras: [] };
    const ids = score(m, plan, true).justifications.filter((j) => j.level === 'hard').map((j) => j.constraintId);
    expect(ids).toContain('builtin:role-type');
    expect(ids).toContain('builtin:one-base'); // the other 20 slots have no base
  });

  it('are only the structure of a meal', () => {
    expect(builtinConstraints().map((c) => c.id)).toEqual([
      'builtin:one-base', 'builtin:max-curry', 'builtin:max-subzi', 'builtin:role-type', 'builtin:extra-twice',
    ]);
  });
});
