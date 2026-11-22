import { is } from '@/planner';
import { exclusionRule, mealRule } from '@/rules';
import { everyMealWith, idsOf, nearNoRulesCount, neverWith, noHardProblems, plannedAtLeast, someMealWith, yieldsTo } from '../expect';
import type { PlanExpectation, RuleCase } from '../types';
import { limitRule } from './comes-with';
import { caseLink } from '../library';

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
        caseLink(sambar, { mode: 'serve', to: 'base', values: [pongal.id] }),
        caseLink(chutney, { mode: 'serve', to: 'base', values: [pongal.id] }),
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
    why: 'The Pongal pairing fix of 8 Nov 2026: a Usually pairing to a curry that is never planned automatically must not push its base out of the plan, and the pairing still brings the side that fits.',
    rules: (lib) => {
      const pongal = lib.dish('Pongal');
      const sambar = lib.dish('Sambar');
      const chutney = lib.dish('Coconut Chutney');
      return [
        caseLink(sambar, { mode: 'serve', to: 'base', values: [pongal.id], strength: 'usually' }),
        caseLink(chutney, { mode: 'serve', to: 'base', values: [pongal.id], strength: 'usually' }),
        mealRule(sambar, ['lunch']),
        exclusionRule(sambar),
      ];
    },
    expect: [nearNoRulesCount('Pongal'), someMealWith('Pongal', ['Coconut Chutney'], ['breakfast', 'lunch', 'dinner']), noHardProblems()],
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
        caseLink(lib.dish('Sambar'), { mode: 'serve', to: 'base', values: [pongal.id] }),
        caseLink(lib.dish('Rasam'), { mode: 'serve', to: 'base', values: [pongal.id] }),
      ];
    },
    expect: [plannedAtLeast('Pongal', 4), everyMealWith('Pongal', ['Sambar']), neverWith('Rasam', 'Pongal'), yieldsTo('Rasam', 'Sambar'), noHardProblems()],
  },
  {
    kind: 'plan',
    id: 'pairing-brings-its-own-pairing',
    group: 'Pairings',
    name: 'A brought side brings its own pairing',
    why: 'Placing a dish brings its pairings, then theirs: Pongal brings Sambar, and Sambar brings the Coconut Chutney always served with it, though neither side is ever planned automatically.',
    rules: (lib) => {
      const sambar = lib.dish('Sambar');
      const chutney = lib.dish('Coconut Chutney');
      return [
        caseLink(sambar, { mode: 'serve', to: 'base', values: [lib.dish('Pongal').id] }),
        {
          name: 'Coconut Chutney with Sambar',
          spec: { template: 'require_with', params: { when: is('id', sambar.id), components: [chutney.id], strength: 'must' } },
        },
        exclusionRule(sambar),
        exclusionRule(chutney),
      ];
    },
    expect: [plannedAtLeast('Pongal', 4), everyMealWith('Pongal', ['Sambar', 'Coconut Chutney']), noHardProblems()],
  },
  {
    kind: 'plan',
    id: 'pairing-to-base-category',
    group: 'Pairings',
    name: 'Pairing to a base category',
    why: 'A pairing aimed at a category of bases reaches every base in the category, not only the first.',
    rules: (lib) => [
      caseLink(lib.dish('Sambar'), { mode: 'serve', to: 'base', kind: 'category', values: [lib.category('Tiffin').id] }),
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
      caseLink(lib.dish('Coconut Chutney'), {
        mode: 'serve', to: 'base', values: [lib.dish('Idli').id], scope: { meals: ['breakfast'] },
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
  {
    kind: 'plan',
    id: 'served-with-ignores-its-limit',
    group: 'Pairings',
    name: "A served side's limit does not make its base rarer",
    why: "A served dish's own limit made its base rarer: Papad is always served with Rice and limited to once a week, and Rice was planned far less often than without the link. A served dish's limits only rank the pick among a link's dishes.",
    rules: (lib) => {
      const papad = lib.dish('Papad');
      const rice = lib.dish('Rice');
      return [caseLink(papad, { mode: 'serve', to: 'base', values: [rice.id] })];
    },
    given: (lib) => [limitRule(lib.dish('Papad'), 1, 'week')],
    expect: [nearNoRulesCount('Rice'), everyMealWith('Rice', ['Papad']), noHardProblems()],
  },
];
