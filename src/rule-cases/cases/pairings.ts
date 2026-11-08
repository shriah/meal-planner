import { exclusionRule, linkRule, mealRule } from '@/rules';
import { everyMealWith, noHardProblems, plannedAtLeast } from '../expect';
import type { RuleCase } from '../types';

export const PAIRING_CASES: RuleCase[] = [
  {
    kind: 'plan',
    id: 'pairing-always-beats-own-meals',
    group: 'Pairings',
    name: "Always pairing beats the side's own meals",
    why: 'A base with an Always pairing was once left out of the plan when its curry was limited to lunch and never planned automatically. The pairing brings the curry to every meal the base is in.',
    rules: (lib) => {
      const pongal = lib.dish('Pongal');
      const sambar = lib.dish('Sambar');
      const chutney = lib.dish('Coconut Chutney');
      return [
        linkRule(sambar, { mode: 'serve', target: 'base_dish', values: [pongal.id] }),
        linkRule(chutney, { mode: 'serve', target: 'base_dish', values: [pongal.id] }),
        mealRule(sambar, ['lunch']),
        exclusionRule(sambar),
      ];
    },
    expect: [
      plannedAtLeast('Pongal', 1),
      everyMealWith('Pongal', ['Sambar', 'Coconut Chutney']),
      noHardProblems(),
    ],
  },
];
