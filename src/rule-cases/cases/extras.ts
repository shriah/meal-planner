import { is } from '@/planner';
import type { RuleCase } from '../types';

export const EXTRAS_CASES: RuleCase[] = [
  {
    kind: 'plan',
    id: 'extras-cap-per-meal',
    group: 'Extras',
    name: 'Extras cap per meal',
    why: 'The breakfast extras cap is a hard limit: a rule asking for more extras than the cap cannot overfill a meal, and the clash is reported.',
    rules: () => [
      {
        name: 'Four extras at breakfast',
        spec: { template: 'require', params: { match: is('componentType', 'extra'), min: 4, scope: { meals: ['breakfast'] }, strength: 'must' } },
      },
    ],
    expect: [
      {
        says: 'No breakfast has more than 2 extras',
        check: (w) => {
          const most = Math.max(0, ...w.weeks.flat().filter((s) => s.meal_slot === 'breakfast').map((s) => s.extra_ids.length));
          return { pass: most <= 2, got: `most in one breakfast: ${most}` };
        },
        highlights: (slot) => slot.meal_slot === 'breakfast' && slot.extra_ids.length > 2,
      },
      {
        says: 'The extras clash is reported as a hard problem in every week',
        check: (w) => {
          const k = w.hard.filter((h) => h.some((j) => j.label.toLowerCase().includes('extra'))).length;
          return { pass: k === w.weeks.length, got: `${k} of ${w.weeks.length} weeks` };
        },
      },
    ],
  },
];
