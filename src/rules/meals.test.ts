import { describe, expect, it } from 'vitest';
import { is } from '@/planner';
import { allowedMealsOf } from './meals';
import { mealRule } from './owned';

const dish = { id: 7, name: 'Poori', componentType: 'base' as const, dietary_tags: [], regional_tags: [], occasion_tags: [] };
const rule = (spec: object, enabled = true) => ({ spec, enabled }) as never;
const meals = (m: string[], extra: object = {}, match = is('id', 7)) =>
  rule({ template: 'allowed_meals', params: { match, meals: m, strength: 'must', ...extra } });

describe('allowedMealsOf', () => {
  it('allows every meal when no rule restricts the dish', () => {
    expect(allowedMealsOf(dish, [])).toEqual(['breakfast', 'lunch', 'dinner']);
  });

  it('uses the dish\'s own rule and any other rule whose match covers it', () => {
    expect(allowedMealsOf(dish, [rule(mealRule(dish, ['breakfast', 'lunch']).spec)])).toEqual(['breakfast', 'lunch']);
    expect(allowedMealsOf(dish, [meals(['breakfast', 'dinner'], {}, is('componentType', 'base'))])).toEqual(['breakfast', 'dinner']);
  });

  it('intersects several rules', () => {
    expect(allowedMealsOf(dish, [meals(['breakfast', 'lunch']), meals(['lunch', 'dinner'])])).toEqual(['lunch']);
  });

  it('ignores rules for other dishes, disabled rules, preferences and rules limited to some days', () => {
    expect(allowedMealsOf(dish, [
      meals(['dinner'], {}, is('id', 8)),
      rule({ template: 'allowed_meals', params: { match: is('id', 7), meals: ['dinner'], strength: 'must' } }, false),
      meals(['dinner'], { strength: 'prefer' }),
      meals(['dinner'], { days: ['monday'] }),
    ])).toEqual(['breakfast', 'lunch', 'dinner']);
  });
});
