import { exclusionRule, linkRule, mealRule } from '@/rules';
import { everyMealWith, idsOf, nearNoRulesCount, neverWith, noHardProblems, plannedAtLeast, someMealWith, yieldsTo } from '../expect';
import type { PlanExpectation, RuleCase } from '../types';

/** Idli planned outside breakfast without Coconut Chutney: the breakfast scope must not leak. */
const idliElsewhereHasNoChutney = (): PlanExpectation => ({
  says: 'Idli at lunch or dinner is planned without Coconut Chutney (in at least one meal)',
  check: (w) => {
    const idli = w.lib.dish('Idli').id;
    const chutney = w.lib.dish('Coconut Chutney').id;
    const meals = w.weeks.flat().filter((s) => s.meal_slot !== 'breakfast' && idsOf(s).includes(idli));
    const without = meals.filter((s) => !idsOf(s).includes(chutney)).length;
    return { pass: without > 0, got: `${without} of ${meals.length} non-breakfast Idli meals` };
  },
  highlights: (slot, lib) => slot.meal_slot !== 'breakfast' && idsOf(slot).includes(lib.dish('Idli').id),
});

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
      nearNoRulesCount('Pongal'),
      everyMealWith('Pongal', ['Sambar', 'Coconut Chutney']),
      someMealWith('Pongal', ['Sambar'], ['breakfast', 'dinner']),
      noHardProblems(),
    ],
  },
  {
    kind: 'plan',
    id: 'pairing-usually-gives-way-to-never-auto',
    group: 'Pairings',
    name: 'Usually pairing gives way to never-auto',
    why: 'The Pongal pairing fix of 8 Nov 2026: a Usually pairing to a curry that is never planned automatically must not push its base out of the plan.',
    rules: (lib) => {
      const pongal = lib.dish('Pongal');
      const sambar = lib.dish('Sambar');
      const chutney = lib.dish('Coconut Chutney');
      return [
        linkRule(sambar, { mode: 'serve', target: 'base_dish', values: [pongal.id], strength: 'usually' }),
        linkRule(chutney, { mode: 'serve', target: 'base_dish', values: [pongal.id], strength: 'usually' }),
        mealRule(sambar, ['lunch']),
        exclusionRule(sambar),
      ];
    },
    expect: [nearNoRulesCount('Pongal'), noHardProblems()],
  },
  {
    kind: 'plan',
    id: 'pairing-two-always-curries',
    group: 'Pairings',
    name: 'Two Always curries for one base',
    why: 'Two Always curries for one base cannot both be held in a meal with one curry slot. The older rule wins, the base is still planned, and no hard rule is reported broken.',
    rules: (lib) => {
      const pongal = lib.dish('Pongal');
      return [
        linkRule(lib.dish('Sambar'), { mode: 'serve', target: 'base_dish', values: [pongal.id] }),
        linkRule(lib.dish('Rasam'), { mode: 'serve', target: 'base_dish', values: [pongal.id] }),
      ];
    },
    expect: [plannedAtLeast('Pongal', 4), everyMealWith('Pongal', ['Sambar']), neverWith('Rasam', 'Pongal'), yieldsTo('Rasam', 'Sambar'), noHardProblems()],
  },
  {
    kind: 'plan',
    id: 'pairing-to-base-category',
    group: 'Pairings',
    name: 'Pairing to a base category',
    why: 'A pairing aimed at a category of bases reaches every base in the category, not only the first.',
    rules: (lib) => [
      linkRule(lib.dish('Sambar'), { mode: 'serve', target: 'base_category', values: [lib.category('Tiffin').id] }),
    ],
    expect: [
      everyMealWith('Idli', ['Sambar']),
      everyMealWith('Dosa', ['Sambar']),
      everyMealWith('Upma', ['Sambar']),
      noHardProblems(),
    ],
  },
  {
    kind: 'plan',
    id: 'pairing-scoped-to-breakfast',
    group: 'Pairings',
    name: 'Pairing scoped to breakfast',
    why: 'A pairing limited to breakfast holds at breakfast only: the same base at another meal is left alone.',
    rules: (lib) => [
      linkRule(lib.dish('Coconut Chutney'), {
        mode: 'serve', target: 'base_dish', values: [lib.dish('Idli').id], scope: { meals: ['breakfast'] },
      }),
    ],
    expect: [
      {
        says: 'Every breakfast with Idli has Coconut Chutney',
        check: (w) => {
          const idli = w.lib.dish('Idli').id;
          const chutney = w.lib.dish('Coconut Chutney').id;
          const meals = w.weeks.flat().filter((s) => s.meal_slot === 'breakfast' && idsOf(s).includes(idli));
          const k = meals.filter((s) => idsOf(s).includes(chutney)).length;
          return { pass: meals.length > 0 && k === meals.length, got: `${k} of ${meals.length}` };
        },
        highlights: (slot, lib) => slot.meal_slot === 'breakfast' && idsOf(slot).includes(lib.dish('Idli').id),
      },
      idliElsewhereHasNoChutney(),
    ],
  },
];
