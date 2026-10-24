import { describe, expect, it } from 'vitest';
import { builtinConstraints, occasionViolation } from './builtins';
import { compileMatcher } from './matcher';
import { compileModel, score } from './scorer';
import { component } from './test-utils';
import { DAYS, emptyPlan, slotIndex, type Day } from './types';
import { OCCASION_TAGS, type OccasionTag } from '@/types/component';

const WEEKEND: Day[] = ['saturday', 'sunday'];

/** Reference definition of which days a component's occasion tags allow. */
function allowed(tags: OccasionTag[], day: Day): boolean {
  if (tags.length === 0 || tags.includes('everyday')) return true;
  if (tags.includes('weekday')) return !WEEKEND.includes(day);
  if (tags.includes('weekend')) return WEEKEND.includes(day);
  const named = tags.filter((t): t is Day => (DAYS as readonly string[]).includes(t));
  return named.length === 0 || named.includes(day);
}

describe('built-in constraints', () => {
  it('occasion matcher agrees with the reference for single tags and pairs on every day', () => {
    const violation = compileMatcher(occasionViolation());
    const tagSets: OccasionTag[][] = [[]];
    for (const a of OCCASION_TAGS) {
      tagSets.push([a]);
      for (const b of OCCASION_TAGS) if (a < b) tagSets.push([a, b]);
    }
    for (const tags of tagSets) {
      for (const day of DAYS) {
        const c = component('curry', { occasion_tags: tags });
        expect(violation({ c, role: 'curry', day, meal: 'lunch' }), `${tags.join('+')} on ${day}`).toBe(!allowed(tags, day));
      }
    }
  });

  it('forbids a restricted curry next to a base outside its compatibility list, naming the category', () => {
    const rice = component('base', { id: 1, base_category_id: 10 });
    const roti = component('base', { id: 2, base_category_id: 20 });
    const sambar = component('curry', { id: 3, compatible_base_category_ids: [10] });
    const anything = component('curry', { id: 4 });
    const library = [rice, roti, sambar, anything];
    const m = compileModel(library, builtinConstraints(library, { baseCategoryName: (id) => (id === 20 ? 'Bread' : 'Rice') }));
    const plan = emptyPlan();
    plan[slotIndex('monday', 'lunch')] = { base: 2, curry: 3, extras: [] };
    plan[slotIndex('monday', 'dinner')] = { base: 1, curry: 3, extras: [] };
    plan[slotIndex('tuesday', 'lunch')] = { base: 2, curry: 4, extras: [] };
    // Other slots are empty, so only look at compatibility violations.
    const compat = score(m, plan, true).justifications.filter((j) => j.constraintId.startsWith('builtin:compat'));
    expect(compat).toHaveLength(1);
    expect(compat[0]).toMatchObject({ label: 'Curry must suit a Bread base', level: 'hard', group: { day: 'monday', meal: 'lunch' } });
  });

  it('enforces the per-meal extras limit', () => {
    const library = [component('base', { id: 1 }), ...[2, 3, 4].map((id) => component('extra', { id }))];
    const m = compileModel(library, builtinConstraints(library, { extraLimits: { dinner: 2 } }));
    const plan = emptyPlan();
    plan[slotIndex('monday', 'dinner')] = { base: 1, extras: [2, 3, 4] };
    const hard = score(m, plan, true).justifications.filter((j) => j.level === 'hard');
    expect(hard.map((j) => j.constraintId)).toContain('builtin:extras-limit:dinner');
  });

  it('reports structural problems in locked slots (wrong role, missing base)', () => {
    const library = [component('base', { id: 1 }), component('curry', { id: 2 })];
    const m = compileModel(library, builtinConstraints(library));
    const plan = emptyPlan();
    plan[slotIndex('monday', 'lunch')] = { base: 2, extras: [] };
    const ids = score(m, plan, true).justifications.filter((j) => j.level === 'hard').map((j) => j.constraintId);
    expect(ids).toContain('builtin:role-type');
    expect(ids).toContain('builtin:one-base'); // the other 20 slots have no base
  });
});
