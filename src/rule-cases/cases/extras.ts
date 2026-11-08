import { is } from '@/planner';
import type { RuleCase } from '../types';

// The cap holds, so the rule left unmet (and reported) is the case's own: it is matched by its exact name.
const ASK = 'Four extras at breakfast';

export const EXTRAS_CASES: RuleCase[] = [
  {
    kind: 'plan',
    id: 'extras-cap-per-meal',
    group: 'Extras',
    name: 'Extras cap per meal',
    why: 'The breakfast extras cap is a hard limit: a rule asking for more extras than the cap cannot overfill a meal, and the clash is reported.',
    rules: () => [
      {
        name: ASK,
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
        highlights: (slot) => slot.meal_slot === 'breakfast',
      },
      {
        says: `The clash is reported: "${ASK}" is left unmet as a hard problem in every week`,
        check: (w) => {
          const k = w.hard.filter((h) => h.some((j) => j.label === ASK)).length;
          return { pass: k === w.weeks.length, got: `${k} of ${w.weeks.length} weeks` };
        },
      },
    ],
  },
];
