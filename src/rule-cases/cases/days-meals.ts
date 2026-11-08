import { is } from '@/planner';
import { exclusionRule, mealRule } from '@/rules';
import { neverAt, plannedAtLeast, plannedBetween } from '../expect';
import type { RuleCase } from '../types';

export const DAYS_MEALS_CASES: RuleCase[] = [
  {
    kind: 'plan',
    id: 'meals-lunch-only-dish',
    group: 'Days and meals',
    name: 'Lunch-only dish',
    why: 'A dish limited to lunch is never planned at breakfast or dinner, and is still planned when a rule asks for a curry at every meal. Without the lunch-only rule Dal would turn up at breakfast and dinner.',
    rules: (lib) => [
      mealRule(lib.dish('Dal'), ['lunch']),
      {
        name: 'A curry at every meal',
        spec: { template: 'require', params: { match: is('componentType', 'curry'), min: 1, strength: 'must' } },
      },
    ],
    expect: [neverAt('Dal', { meals: ['breakfast', 'dinner'] }), plannedAtLeast('Dal', 1)],
  },
  {
    kind: 'plan',
    id: 'meals-never-auto-dish',
    group: 'Days and meals',
    name: 'Never-auto dish',
    why: 'A dish set to never be planned automatically stays out of every generated week, even when a rule asks for a curry at every meal.',
    rules: (lib) => [
      exclusionRule(lib.dish('Chole')),
      {
        name: 'A curry at every meal',
        spec: { template: 'require', params: { match: is('componentType', 'curry'), min: 1, strength: 'must' } },
      },
    ],
    expect: [plannedBetween('Chole', 0, 0)],
  },
];
