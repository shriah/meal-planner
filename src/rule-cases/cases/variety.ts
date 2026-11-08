import { DAYS } from '@/planner';
import type { RuleCase } from '../types';

export const VARIETY_CASES: RuleCase[] = [
  {
    kind: 'plan',
    id: 'variety-no-base-on-consecutive-days',
    group: 'Variety',
    name: 'No base on the next day',
    why: 'The spacing default (no dish on the same or next day) keeps a base from coming back the next day; this checks bases on consecutive days only. It is a soft rule, so it holds when the library has room for it.',
    known: 'With the default rules only, seed 4 plans Pongal on both Wednesday and Thursday (1 repeat in 8 weeks), although the other 7 seeds find weeks with none; the soft spacing rule is left unmet when it could be held.',
    rules: () => [],
    expect: [
      {
        says: 'No base is planned on two consecutive days in any of the 8 weeks',
        check: (w) => {
          let repeats = 0;
          for (const week of w.weeks) {
            for (let d = 0; d + 1 < DAYS.length; d++) {
              const today = new Set(week.filter((s) => s.day === DAYS[d]).map((s) => s.base_id));
              repeats += week.filter((s) => s.day === DAYS[d + 1] && s.base_id !== undefined && today.has(s.base_id)).length;
            }
          }
          return { pass: repeats === 0, got: `${repeats === 1 ? '1 meal repeats' : `${repeats} meals repeat`} the previous day's base` };
        },
      },
    ],
  },
];
