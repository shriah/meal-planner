import { is, type PartSlot } from '@/planner';
import { bringMode, linkRule, mealRule } from '@/rules';
import type { BaseRecord, ComponentRecord, CurryRecord, ExtraRecord } from '@/types/component';
import { everyPartMeal, partDishes, ruleIssueNamed, atLeastPicked, eachPlanned, everyPicked, mealsPicked, mostPicked, nonePicked, someWeekPicks, type Pick, everyMealWith, everyMealWithOneOf, idsOf, nearNoRulesCount, neverWith, noHardProblems, notRarerThanNoRules, plannedAtLeast, yieldsTo } from '../expect';
import type { PlanSlot } from '@/types/plan';
import type { CaseLibrary, CaseRule, CaseWeeks, PlanExpectation, RuleCase } from '../types';
import { caseLink, libraryOf, TEST_LIBRARY } from '../library';
import { CURRY_AT_EVERY_MEAL } from './days-meals';

const CREATED = '2026-01-01T00:00:00.000Z';
const fields = () => ({ dietary_tags: ['veg' as const], regional_tags: [], occasion_tags: [], frequency: 'normal' as const, created_at: CREATED });

// Case-only dishes (ids from 900). Pepper Rasam is an extra: the test library already has a curry named Rasam.
const IDIYAPPAM: BaseRecord = { ...fields(), id: 900, name: 'Idiyappam', componentType: 'base', base_category_id: 2, base_type: 'other' };
const STEW_VEG: CurryRecord = { ...fields(), id: 901, name: 'Kerala Stew (Veg)', componentType: 'curry', curry_category: 'stew' };
const STEW_NON_VEG: CurryRecord = { ...fields(), id: 902, name: 'Kerala Stew (Non-Veg)', componentType: 'curry', curry_category: 'stew' };
const MUTTON_CURRY: CurryRecord = { ...fields(), id: 903, name: 'Mutton Curry', componentType: 'curry', curry_category: 'mutton' };
const PEPPER_RASAM: ExtraRecord = { ...fields(), id: 904, name: 'Pepper Rasam', componentType: 'extra', extra_category_id: 11, extra_category: 'condiment' };
// A second crunchy extra for the cases where a conditional link ranks two extras.
const MURUKKU: ExtraRecord = { ...fields(), id: 907, name: 'Murukku', componentType: 'extra', extra_category_id: 12, extra_category: 'crunchy' };
const DISHES: ComponentRecord[] = [IDIYAPPAM, STEW_VEG, STEW_NON_VEG, MUTTON_CURRY, PEPPER_RASAM];
// The two stews again (ids from 905), the Veg one frequent and the Non-Veg one rare, in place of 901 and 902.
const FREQUENT_STEW_VEG: ComponentRecord = { ...STEW_VEG, id: 905, frequency: 'frequent' };
const RARE_STEW_NON_VEG: ComponentRecord = { ...STEW_NON_VEG, id: 906, frequency: 'rare' };
const DISHES_BY_FREQUENCY: ComponentRecord[] = [IDIYAPPAM, FREQUENT_STEW_VEG, RARE_STEW_NON_VEG];

/** A hand-written count limit on one dish, as the Rules page stores it (not an owned rule). */
export const limitRule = (dish: ComponentRecord, max: number, per: 'week' | 'day'): CaseRule => ({
  name: `Limit ${dish.name} to ${max} per ${per}`,
  spec: { template: 'limit', params: { match: is('id', dish.id), per, max, strength: 'must' } },
});

const STEWS = ['Kerala Stew (Veg)', 'Kerala Stew (Non-Veg)'];
const REPORT = 'The 2026-11-09 Idiyappam report: ';

/** The Monday lunch holds exactly these extras. */
const mondayLunchExtras = (names: string[]): PlanExpectation => ({
  says: `The pinned Monday lunch holds exactly the extras ${names.join(' and ')}`,
  check: (w) => {
    const want = names.map((n) => w.lib.dish(n).id).sort();
    const k = w.weeks.filter((wk) => {
      const s = wk.find((x) => x.day === 'monday' && x.meal_slot === 'lunch');
      return s !== undefined && [...s.extra_ids].sort().join() === want.join();
    }).length;
    return { pass: k === w.weeks.length, got: `${k} of ${w.weeks.length} weeks` };
  },
  highlights: (slot) => slot.day === 'monday' && slot.meal_slot === 'lunch',
});

const PAIRING_CASES: RuleCase[] = [
  {
    kind: 'plan',
    id: 'comes-with-either-stew',
    group: 'Pairings',
    name: 'Comes with either of two stews',
    why: `${REPORT}Idiyappam comes with Kerala Stew (Veg) or Kerala Stew (Non-Veg): every Idiyappam meal has one of them, and over the weeks both turn up.`,
    dishes: DISHES,
    rules: (lib) => [caseLink(IDIYAPPAM, { mode: 'comes', to: 'curry', values: STEWS.map((n) => lib.dish(n).id) })],
    given: () => [mealRule(IDIYAPPAM, ['breakfast'])],
    expect: [
      everyMealWithOneOf('Idiyappam', STEWS),
      eachPlanned(STEWS, 'Idiyappam'),
      nearNoRulesCount('Idiyappam'),
      noHardProblems(),
    ],
  },
  {
    kind: 'plan',
    id: 'comes-with-respects-frequency',
    group: 'Pairings',
    name: 'Comes with a frequent stew more often than a rare one',
    why: `${REPORT}"prefer frequent / avoid rare" still holds among a link's dishes: Idiyappam comes with Kerala Stew (Veg), which is frequent, or Kerala Stew (Non-Veg), which is rare; both turn up, the frequent one at least half again as often (a week has only two or three Idiyappam meals, so the rare stew still gets its turn in many weeks).`,
    dishes: DISHES_BY_FREQUENCY,
    rules: (lib) => [caseLink(IDIYAPPAM, { mode: 'comes', to: 'curry', values: STEWS.map((n) => lib.dish(n).id) })],
    given: () => [mealRule(IDIYAPPAM, ['breakfast'])],
    expect: [
      eachPlanned(STEWS, 'Idiyappam'),
      {
        says: 'Kerala Stew (Veg) is planned with Idiyappam at least half again as often as Kerala Stew (Non-Veg)',
        check: (w) => {
          const idi = w.lib.dish('Idiyappam').id;
          const meals = w.weeks.flat().filter((s) => idsOf(s).includes(idi));
          const count = (name: string) => meals.filter((s) => idsOf(s).includes(w.lib.dish(name).id)).length;
          const [frequent, rare] = STEWS.map(count);
          return { pass: 2 * frequent >= 3 * rare, got: `${frequent} with Kerala Stew (Veg), ${rare} with Kerala Stew (Non-Veg)` };
        },
        highlights: (slot, lib) => idsOf(slot).includes(lib.dish('Idiyappam').id),
      },
    ],
  },
  {
    kind: 'plan',
    id: 'comes-with-curry-to-extra',
    group: 'Pairings',
    name: 'A curry comes with an extra',
    why: `${REPORT}a curry can bring an extra: Mutton Curry comes with Pepper Rasam wherever it is planned.`,
    dishes: DISHES,
    rules: () => [caseLink(MUTTON_CURRY, { mode: 'comes', to: 'extra', values: [PEPPER_RASAM.id] })],
    given: () => [CURRY_AT_EVERY_MEAL],
    expect: [everyMealWith('Mutton Curry', ['Pepper Rasam'])],
  },
  {
    kind: 'plan',
    id: 'comes-with-from-base-and-curry',
    group: 'Pairings',
    name: 'A base and its curry each bring an extra',
    why: `${REPORT}a meal holds what each of its dishes brings: Rice brings Papad and Mutton Curry brings Pepper Rasam.`,
    dishes: DISHES,
    rules: (lib) => [
      caseLink(lib.dish('Rice'), { mode: 'comes', to: 'extra', values: [lib.dish('Papad').id] }),
      caseLink(MUTTON_CURRY, { mode: 'comes', to: 'extra', values: [PEPPER_RASAM.id] }),
    ],
    pins: { 'monday-lunch': { base_id: TEST_LIBRARY.dish('Rice').id, curry_id: MUTTON_CURRY.id } },
    expect: [mondayLunchExtras(['Papad', 'Pepper Rasam'])],
  },
  {
    kind: 'plan',
    id: 'comes-with-two-links',
    group: 'Pairings',
    name: 'Two links from one dish',
    why: `${REPORT}a dish with two comes-with links brings both: Idli comes with Coconut Chutney and with Tomato Chutney.`,
    dishes: DISHES,
    rules: (lib) => [
      caseLink(lib.dish('Idli'), { mode: 'comes', to: 'extra', values: [lib.dish('Coconut Chutney').id] }),
      caseLink(lib.dish('Idli'), { mode: 'comes', to: 'extra', values: [lib.dish('Tomato Chutney').id] }),
    ],
    expect: [everyMealWith('Idli', ['Coconut Chutney', 'Tomato Chutney'])],
  },
  {
    kind: 'plan',
    id: 'comes-with-usually',
    group: 'Pairings',
    name: 'Usually comes with a stew',
    why: `${REPORT}a Usually link is a preference: Idiyappam is still planned about as often, and usually has the stew.`,
    dishes: DISHES,
    rules: () => [caseLink(IDIYAPPAM, { mode: 'comes', to: 'curry', values: [STEW_VEG.id], strength: 'usually' })],
    given: () => [mealRule(IDIYAPPAM, ['breakfast'])],
    expect: [
      nearNoRulesCount('Idiyappam'),
      {
        says: 'Kerala Stew (Veg) is in most of the Idiyappam meals',
        check: (w) => {
          const idi = w.lib.dish('Idiyappam').id;
          const stew = w.lib.dish('Kerala Stew (Veg)').id;
          const meals = w.weeks.flat().filter((s) => idsOf(s).includes(idi));
          const k = meals.filter((s) => idsOf(s).includes(stew)).length;
          return { pass: meals.length > 0 && k * 2 > meals.length, got: `${k} of ${meals.length}` };
        },
        highlights: (slot, lib) => idsOf(slot).includes(lib.dish('Idiyappam').id),
      },
    ],
  },
  {
    kind: 'plan',
    id: 'comes-with-curry-type',
    group: 'Pairings',
    name: 'Comes with a curry type',
    why: `${REPORT}a link can name a curry type: Idiyappam comes with a stew, and either stew meets it.`,
    dishes: DISHES,
    rules: (lib) => [caseLink(IDIYAPPAM, { mode: 'comes', to: 'curry', kind: 'category', values: [lib.category('stew').id] })],
    given: () => [mealRule(IDIYAPPAM, ['breakfast'])],
    expect: [everyMealWithOneOf('Idiyappam', STEWS)],
  },
  {
    kind: 'plan',
    id: 'comes-with-chain',
    group: 'Pairings',
    name: 'A brought dish brings its own',
    why: `${REPORT}what a dish brings brings its own: Idiyappam brings Kerala Stew (Veg), which brings Pepper Rasam.`,
    dishes: DISHES,
    rules: () => [
      caseLink(IDIYAPPAM, { mode: 'comes', to: 'curry', values: [STEW_VEG.id] }),
      caseLink(STEW_VEG, { mode: 'comes', to: 'extra', values: [PEPPER_RASAM.id] }),
    ],
    given: () => [mealRule(IDIYAPPAM, ['breakfast'])],
    expect: [everyMealWith('Idiyappam', ['Kerala Stew (Veg)', 'Pepper Rasam'])],
  },
  {
    kind: 'plan',
    id: 'only-with-bases-still-limits',
    group: 'Pairings',
    name: 'Only-with bases still limits a curry',
    why: `${REPORT}a curry that goes only with certain bases is kept to them, and is still planned; and it is not brought to them: some Idli or Dosa meal has another curry.`,
    rules: (lib) => [
      caseLink(lib.dish('Sambar'), { mode: 'with', to: 'base', values: [lib.dish('Idli').id, lib.dish('Dosa').id] }),
    ],
    given: () => [CURRY_AT_EVERY_MEAL],
    expect: [
      neverWith('Sambar', 'Pongal'),
      plannedAtLeast('Sambar', 1),
      {
        says: 'Some Idli or Dosa meal has no Sambar (the link limits Sambar, it does not bring it)',
        check: (w) => {
          const sambar = w.lib.dish('Sambar').id;
          const bases = [w.lib.dish('Idli').id, w.lib.dish('Dosa').id];
          const meals = w.weeks.flat().filter((s) => bases.some((b) => idsOf(s).includes(b)));
          const without = meals.filter((s) => !idsOf(s).includes(sambar)).length;
          return { pass: without > 0, got: `${without} of ${meals.length} Idli and Dosa meals` };
        },
        highlights: (slot, lib) => idsOf(slot).includes(lib.dish('Idli').id) || idsOf(slot).includes(lib.dish('Dosa').id),
      },
    ],
  },
  {
    kind: 'plan',
    id: 'old-only-with-still-limits',
    group: 'Pairings',
    name: 'Only-with curries still limits a base',
    why: `${REPORT}a base that goes only with certain curries is kept to them: every Idiyappam meal has a stew. That an old only-with link does not bring is pinned by the owned.test.ts unit test that the avoid_with link still reads as mode 'with'; a curry at every meal makes it unobservable here.`,
    dishes: DISHES,
    rules: () => [caseLink(IDIYAPPAM, { mode: 'with', to: 'curry', values: [STEW_VEG.id, STEW_NON_VEG.id] })],
    given: () => [mealRule(IDIYAPPAM, ['breakfast']), CURRY_AT_EVERY_MEAL],
    expect: [everyMealWithOneOf('Idiyappam', STEWS)],
  },
  {
    kind: 'plan',
    id: 'comes-with-clash',
    group: 'Pairings',
    name: 'Two Always links to curries clash',
    why: `${REPORT}two Always curries for one base cannot share a curry slot: the older link wins, the base is still planned, and no hard rule is reported broken.`,
    dishes: DISHES,
    rules: () => [
      caseLink(IDIYAPPAM, { mode: 'comes', to: 'curry', values: [STEW_VEG.id] }),
      caseLink(IDIYAPPAM, { mode: 'comes', to: 'curry', values: [MUTTON_CURRY.id] }),
    ],
    given: () => [mealRule(IDIYAPPAM, ['breakfast'])],
    expect: [
      plannedAtLeast('Idiyappam', 4),
      everyMealWith('Idiyappam', ['Kerala Stew (Veg)']),
      yieldsTo('Idiyappam', 'Kerala Stew (Veg)'),
      noHardProblems(),
    ],
  },
  {
    kind: 'plan',
    id: 'brought-side-ignores-its-limit',
    group: 'Pairings',
    name: "A brought side's limit does not make its base rarer",
    why: `${REPORT}Kerala Stew (Veg) was limited to once a week, and Idiyappam, which always comes with it, became rarer: a brought dish's own limit made its base rarer. A brought dish's limits only rank the pick among a link's dishes.`,
    dishes: DISHES,
    rules: (lib) => [caseLink(IDIYAPPAM, { mode: 'comes', to: 'curry', values: [lib.dish('Kerala Stew (Veg)').id] })],
    given: () => [mealRule(IDIYAPPAM, ['breakfast']), limitRule(STEW_VEG, 1, 'week')],
    expect: [nearNoRulesCount('Idiyappam'), everyMealWith('Idiyappam', ['Kerala Stew (Veg)']), noHardProblems()],
  },
  {
    kind: 'plan',
    id: 'brought-side-ignores-its-limit-usually',
    group: 'Pairings',
    name: "A usually-brought side's limit does not make its base rarer",
    why: `${REPORT}as the Always case, with a Usually link: a brought dish's own limit made its base rarer. The stew is still in at least 3 of 4 Idiyappam meals.`,
    dishes: DISHES,
    rules: () => [caseLink(IDIYAPPAM, { mode: 'comes', to: 'curry', values: [STEW_VEG.id], strength: 'usually' })],
    given: () => [mealRule(IDIYAPPAM, ['breakfast']), limitRule(STEW_VEG, 1, 'week')],
    expect: [
      nearNoRulesCount('Idiyappam'),
      {
        says: 'Kerala Stew (Veg) is in at least 3 of 4 Idiyappam meals',
        check: (w) => {
          const idi = w.lib.dish('Idiyappam').id;
          const stew = w.lib.dish('Kerala Stew (Veg)').id;
          const meals = w.weeks.flat().filter((s) => idsOf(s).includes(idi));
          const k = meals.filter((s) => idsOf(s).includes(stew)).length;
          return { pass: meals.length > 0 && k * 4 >= meals.length * 3, got: `${k} of ${meals.length}` };
        },
        highlights: (slot, lib) => idsOf(slot).includes(lib.dish('Idiyappam').id),
      },
    ],
  },
  {
    kind: 'plan',
    id: 'limit-ranks-a-links-dishes',
    group: 'Pairings',
    name: "A limit ranks the dishes of a link",
    why: `${REPORT}Idiyappam comes with a frequent Kerala Stew (Veg) or a rare Kerala Stew (Non-Veg), and the frequent one is limited to once a week. Frequency alone would pick the frequent stew for most meals; the limit ranks it down, so it is in at most one Idiyappam meal a week and the others take the other stew. A brought dish's limit no longer counts against its base, so only the limit ranking the link's dishes can hold this. The frequent stew must still get its one meal in most weeks: a pick made while the search briefly had it in another meal was never revisited, crowding it out of the link.`,
    dishes: DISHES_BY_FREQUENCY,
    rules: (lib) => [caseLink(IDIYAPPAM, { mode: 'comes', to: 'curry', values: [lib.dish('Kerala Stew (Veg)').id, lib.dish('Kerala Stew (Non-Veg)').id] })],
    given: () => [mealRule(IDIYAPPAM, ['breakfast']), limitRule(FREQUENT_STEW_VEG, 1, 'week')],
    expect: [
      everyMealWithOneOf('Idiyappam', STEWS),
      {
        says: 'Kerala Stew (Veg) is in at most one Idiyappam meal in any week',
        check: (w) => {
          const idi = w.lib.dish('Idiyappam').id;
          const stew = w.lib.dish('Kerala Stew (Veg)').id;
          const bad = w.weeks.filter((wk) => wk.filter((s) => idsOf(s).includes(idi) && idsOf(s).includes(stew)).length > 1).length;
          return { pass: bad === 0, got: `${bad} of ${w.weeks.length} weeks have more` };
        },
        highlights: (slot, lib) => idsOf(slot).includes(lib.dish('Idiyappam').id),
      },
      {
        // Every week has an Idiyappam meal and the limit allows the frequent stew once in each; 6 of 8 leaves
        // room for a week the search ends with another breakfast holding it.
        says: 'Kerala Stew (Veg) is in an Idiyappam meal in at least 6 of 8 weeks',
        check: (w) => {
          const idi = w.lib.dish('Idiyappam').id;
          const stew = w.lib.dish('Kerala Stew (Veg)').id;
          const good = w.weeks.filter((wk) => wk.some((s) => idsOf(s).includes(idi) && idsOf(s).includes(stew))).length;
          return { pass: good * 8 >= w.weeks.length * 6, got: `${good} of ${w.weeks.length} weeks` };
        },
        highlights: (slot, lib) => idsOf(slot).includes(lib.dish('Idiyappam').id),
      },
    ],
  },
  {
    kind: 'plan',
    id: 'brought-chain-ignores-limit',
    group: 'Pairings',
    name: "A limit on the end of a chain does not make the base rarer",
    why: `${REPORT}Idiyappam brings Kerala Stew (Veg), which brings Pepper Rasam, limited to once a week: a brought dish's own limit, two links down, made the base rarer. The links alone make Idiyappam more frequent than with no rules, so only "not rarer" is checked.`,
    dishes: DISHES,
    rules: () => [
      caseLink(IDIYAPPAM, { mode: 'comes', to: 'curry', values: [STEW_VEG.id] }),
      caseLink(STEW_VEG, { mode: 'comes', to: 'extra', values: [PEPPER_RASAM.id] }),
    ],
    given: () => [mealRule(IDIYAPPAM, ['breakfast']), limitRule(PEPPER_RASAM, 1, 'week')],
    expect: [notRarerThanNoRules('Idiyappam'), everyMealWith('Idiyappam', ['Kerala Stew (Veg)', 'Pepper Rasam'])],
  },

];

// "Papad only with Rice and Sambar": Rice comes with Papad when the meal's curry is Sambar.
const PAPAD_RULE = 'Papad only with Rice and Sambar: ';
const dishId = (lib: CaseLibrary, name: string) => lib.dish(name).id;
const hasDish = (name: string): Pick => (s, lib) => idsOf(s).includes(dishId(lib, name));
const curryIs = (...names: string[]): Pick => (s, lib) => s.curry_id !== undefined && names.some((n) => s.curry_id === dishId(lib, n));
const otherCurry = (...names: string[]): Pick => (s, lib) => s.curry_id !== undefined && !curryIs(...names)(s, lib);
const subziIs = (name: string): Pick => (s, lib) => s.subzi_id === dishId(lib, name);
const baseIs = (...names: string[]): Pick => (s, lib) => s.base_id !== undefined && names.some((n) => s.base_id === dishId(lib, n));
const allOf = (...picks: Pick[]): Pick => (s, lib) => picks.every((p) => p(s, lib));
const not = (p: Pick): Pick => (s, lib) => !p(s, lib);

const riceSambar = allOf(baseIs('Rice'), curryIs('Sambar'));
const papad = hasDish('Papad');

/** Rice + Sambar meals stay within x1.5 of the count without the case's rules, which must itself be at least MIN_BASELINE. */
const MIN_BASELINE = 8;
const nearNoRulesRiceSambar: PlanExpectation = {
  says: `Rice with Sambar is planned about as often as without the case's rules (which has at least ${MIN_BASELINE} such meals)`,
  check: (w, ctx) => {
    const total = mealsPicked(w, riceSambar).length;
    const base = mealsPicked(ctx.baseline(), riceSambar).length;
    const pass = base >= MIN_BASELINE && total >= base / 1.5 && total <= base * 1.5;
    return { pass, got: `${total} (${base} without the rules)` };
  },
  highlights: (slot, lib) => riceSambar(slot, lib),
};

const MORE_THAN_TWO = someWeekPicks('Some week has more than 2 Rice meals with Sambar, so a limit of 2 Papad a week binds', riceSambar, 2);

const papadWhen = (when: { curry?: string[]; subzi?: string[] }, extra: { strength?: 'usually'; scope?: { meals: ['lunch'] }; values?: string[] } = {}) =>
  (lib: CaseLibrary): CaseRule[] => [
    caseLink(lib.dish('Rice'), {
      mode: 'comes',
      to: 'extra',
      values: (extra.values ?? ['Papad']).map((n) => dishId(lib, n)),
      when: { ...(when.curry && { curry: when.curry.map((n) => dishId(lib, n)) }), ...(when.subzi && { subzi: when.subzi.map((n) => dishId(lib, n)) }) },
      ...(extra.strength && { strength: extra.strength }),
      ...(extra.scope && { scope: extra.scope }),
    }),
  ];

const papadOnSambar = papadWhen({ curry: ['Sambar'] });
const EVERY_RICE_SAMBAR_HAS_PAPAD = everyPicked('Every Rice meal with Sambar has Papad', riceSambar, papad);
const NO_OTHER_PAPAD = [
  nonePicked('No Rice meal with another curry has Papad', allOf(baseIs('Rice'), otherCurry('Sambar')), papad),
  nonePicked('No Idli or Dosa meal with Sambar has Papad', allOf(baseIs('Idli', 'Dosa'), curryIs('Sambar')), papad),
];

const SUBZI_AT_EVERY_MEAL: CaseRule = {
  name: 'A subzi at every meal',
  spec: { template: 'require', params: { match: is('componentType', 'subzi'), min: 1, strength: 'must' } },
};
/** Rice comes with Sambar, so Rice and Sambar meals are common enough to check. */
const riceWithSambar = (lib: CaseLibrary, strength?: 'usually' | 'sometimes') =>
  caseLink(lib.dish('Rice'), { mode: 'comes', to: 'curry', values: [dishId(lib, 'Sambar')], ...(strength && { strength }) });

function conditionalCases(): RuleCase[] {
  return [
    {
      kind: 'plan',
      id: 'when-curry-brings',
      group: 'Pairings',
      name: 'Papad comes with Rice only when the curry is Sambar',
      why: `${PAPAD_RULE}Rice comes with Papad when the meal has Sambar: every Rice and Sambar meal has Papad, and no Rice meal with another curry, nor Idli or Dosa with Sambar, is given it by the link.`,
      rules: papadOnSambar,
      given: () => [CURRY_AT_EVERY_MEAL],
      expect: [EVERY_RICE_SAMBAR_HAS_PAPAD, ...NO_OTHER_PAPAD, noHardProblems()],
    },
    {
      kind: 'plan',
      id: 'when-curry-keeps-curry-count',
      group: 'Pairings',
      name: 'A conditional link does not make Rice with Sambar rarer',
      why: `${PAPAD_RULE}the link waits for Sambar, so it must not crowd Sambar out of the Rice meals it was made for: Rice and Sambar meals stay within x1.5 of the count with no rules, and still have Papad. Passes today because the planner ignores the condition and brings Papad to every Rice meal, which is also what this case wants; it guards the condition once the planner reads it.`,
      rules: papadOnSambar,
      given: (lib) => [CURRY_AT_EVERY_MEAL, riceWithSambar(lib, 'sometimes')],
      expect: [nearNoRulesRiceSambar, EVERY_RICE_SAMBAR_HAS_PAPAD],
    },
    {
      kind: 'plan',
      id: 'when-curry-usually',
      group: 'Pairings',
      name: 'Usually papad with Rice when the curry is Sambar',
      why: `${PAPAD_RULE}a Usually conditional link is a preference: Papad is in at least 3 of 4 Rice and Sambar meals. Passes today because the planner ignores the condition and brings Papad to every Rice meal, which is also what this case wants; it guards the condition once the planner reads it.`,
      rules: papadWhen({ curry: ['Sambar'] }, { strength: 'usually' }),
      given: (lib) => [CURRY_AT_EVERY_MEAL, riceWithSambar(lib, 'sometimes')],
      expect: [atLeastPicked('There are at least 8 Rice meals with Sambar', riceSambar, 8), mostPicked('Papad is in at least 3 of 4 Rice meals with Sambar', riceSambar, papad, 3, 4)],
    },
    {
      kind: 'plan',
      id: 'when-curry-two-curries',
      group: 'Pairings',
      name: 'Papad comes with Rice when the curry is Sambar or Rasam',
      why: `${PAPAD_RULE}a condition naming two curries is met by either: every Rice meal with Sambar or with Rasam has Papad. Passes today because the planner ignores the condition and brings Papad to every Rice meal, which is also what this case wants; it guards the condition once the planner reads it.`,
      rules: papadWhen({ curry: ['Sambar', 'Rasam'] }),
      given: () => [CURRY_AT_EVERY_MEAL],
      expect: [
        everyPicked('Every Rice meal with Sambar has Papad', riceSambar, papad),
        everyPicked('Every Rice meal with Rasam has Papad', allOf(baseIs('Rice'), curryIs('Rasam')), papad),
      ],
    },
    {
      kind: 'plan',
      id: 'when-curry-and-subzi',
      group: 'Pairings',
      name: 'Papad comes with Rice when the curry is Sambar and the subzi Beans Poriyal',
      why: `${PAPAD_RULE}the parts of a condition are all required: only a Rice meal with Sambar and Beans Poriyal has Papad, not Sambar with another or no subzi, nor Beans Poriyal with another curry (a pinned Monday lunch of Rice, Rasam and Beans Poriyal).`,
      rules: papadWhen({ curry: ['Sambar'], subzi: ['Beans Poriyal'] }),
      given: (lib) => [CURRY_AT_EVERY_MEAL, SUBZI_AT_EVERY_MEAL, riceWithSambar(lib, 'sometimes')],
      expect: [
        everyPicked('Every Rice meal with Sambar and Beans Poriyal has Papad', allOf(riceSambar, subziIs('Beans Poriyal')), papad),
        nonePicked('No Rice meal with Sambar and another or no subzi has Papad', allOf(riceSambar, not(subziIs('Beans Poriyal'))), papad),
        mondayLunchHas('Papad', false, 'pinned Monday lunch of Rice, Rasam and Beans Poriyal'),
      ],
      pins: { 'monday-lunch': { base_id: TEST_LIBRARY.dish('Rice').id, curry_id: TEST_LIBRARY.dish('Rasam').id, subzi_id: TEST_LIBRARY.dish('Beans Poriyal').id } },
    },
    {
      kind: 'plan',
      id: 'when-curry-chain',
      group: 'Pairings',
      name: 'Papad waits for a curry that Rice itself brings',
      why: `${PAPAD_RULE}Rice always comes with Sambar, and Papad waits for Sambar: the condition is met by a curry another link brought, so every Rice meal has Sambar and Papad. Passes today because the planner ignores the condition and brings the dish to every Rice meal, which is also what this case wants; it guards the condition once the planner reads it.`,
      rules: papadOnSambar,
      given: (lib) => [caseLink(lib.dish('Rice'), { mode: 'comes', to: 'curry', values: [dishId(lib, 'Sambar')] })],
      expect: [everyPicked('Every Rice meal has Sambar and Papad', baseIs('Rice'), allOf(curryIs('Sambar'), papad))],
    },
    {
      kind: 'plan',
      id: 'when-curry-subzi',
      group: 'Pairings',
      name: 'A subzi comes with Rice when the curry is Sambar',
      why: `${PAPAD_RULE}a condition can wait to bring a subzi too: Rice comes with Beans Poriyal when the meal has Sambar, so every Rice and Sambar meal has it. Passes today because the planner ignores the condition and brings the dish to every Rice meal, which is also what this case wants; it guards the condition once the planner reads it.`,
      rules: (lib) => [caseLink(lib.dish('Rice'), { mode: 'comes', to: 'subzi', values: [dishId(lib, 'Beans Poriyal')], when: { curry: [dishId(lib, 'Sambar')] } })],
      given: () => [CURRY_AT_EVERY_MEAL],
      expect: [everyPicked('Every Rice meal with Sambar has Beans Poriyal', riceSambar, subziIs('Beans Poriyal'))],
    },
    {
      kind: 'plan',
      id: 'when-curry-scope',
      group: 'Pairings',
      name: 'A conditional link keeps its meals',
      why: `${PAPAD_RULE}the link applies to lunch only: Rice and Sambar lunches have Papad and no Rice and Sambar dinner has it from the link. Passes today because the planner ignores the condition and brings Papad to every Rice meal, which is also what this case wants; it guards the condition once the planner reads it.`,
      rules: papadWhen({ curry: ['Sambar'] }, { scope: { meals: ['lunch'] } }),
      given: (lib) => [CURRY_AT_EVERY_MEAL, riceWithSambar(lib)],
      expect: [
        everyPicked('Every Rice lunch with Sambar has Papad', allOf(riceSambar, (s) => s.meal_slot === 'lunch'), papad),
        nonePicked('No Rice dinner with Sambar has Papad', allOf(riceSambar, (s) => s.meal_slot === 'dinner'), papad),
      ],
    },
    {
      kind: 'plan',
      id: 'when-curry-beats-plain-subzi',
      group: 'Pairings',
      name: 'A conditional subzi link beats an older plain one',
      why: `${PAPAD_RULE}Rice usually comes with Aloo Gobi (an older link) and with Beans Poriyal when the meal has Sambar: the conditional one is firmer for its meals, so every Rice and Sambar meal has Beans Poriyal, and other Rice meals mostly keep Aloo Gobi.`,
      rules: (lib) => [caseLink(lib.dish('Rice'), { mode: 'comes', to: 'subzi', values: [dishId(lib, 'Beans Poriyal')], when: { curry: [dishId(lib, 'Sambar')] } })],
      given: (lib) => [
        caseLink(lib.dish('Rice'), { mode: 'comes', to: 'subzi', values: [dishId(lib, 'Aloo Gobi')], strength: 'usually' }),
        CURRY_AT_EVERY_MEAL,
        SUBZI_AT_EVERY_MEAL,
      ],
      expect: [
        everyPicked('Every Rice meal with Sambar has Beans Poriyal', riceSambar, subziIs('Beans Poriyal')),
        mostPicked('Aloo Gobi is in most other Rice meals', allOf(baseIs('Rice'), not(curryIs('Sambar'))), subziIs('Aloo Gobi'), 1, 2),
      ],
    },
    {
      kind: 'plan',
      id: 'when-curry-ignores-limit',
      group: 'Pairings',
      name: "A brought dish's limit does not stop a conditional link",
      why: `${PAPAD_RULE}Papad is limited to twice a week: its limit only ranks a pick, so every Rice and Sambar meal still has Papad, no hard rule is broken and Rice with Sambar is not made rarer. Passes today because the planner ignores the condition and brings Papad to every Rice meal, which is also what this case wants; it guards the condition once the planner reads it.`,
      rules: papadOnSambar,
      given: (lib) => [limitRule(lib.dish('Papad'), 2, 'week'), CURRY_AT_EVERY_MEAL, riceWithSambar(lib, 'sometimes')],
      expect: [MORE_THAN_TWO, EVERY_RICE_SAMBAR_HAS_PAPAD, noHardProblems(), nearNoRulesRiceSambar],
    },
    {
      kind: 'plan',
      id: 'when-curry-ranks-two-extras',
      group: 'Pairings',
      name: 'A conditional link ranks its two extras by the limit',
      why: `${PAPAD_RULE}Rice comes with Papad or Murukku when the meal has Sambar, and Papad is limited to twice a week: every Rice and Sambar meal has one of them, and the limit ranks Papad down so it is in at most two meals a week. Passes today because the planner ignores the condition and brings Papad to every Rice meal, which is also what this case wants; it guards the condition once the planner reads it.`,
      dishes: [MURUKKU],
      rules: papadWhen({ curry: ['Sambar'] }, { values: ['Papad', 'Murukku'] }),
      given: (lib) => [limitRule(lib.dish('Papad'), 2, 'week'), CURRY_AT_EVERY_MEAL, riceWithSambar(lib, 'sometimes')],
      expect: [
        MORE_THAN_TWO,
        everyPicked('Every Rice meal with Sambar has Papad or Murukku', riceSambar, (s, lib) => papad(s, lib) || hasDish('Murukku')(s, lib)),
        {
          says: 'Papad is in at most two meals in any week',
          check: (w) => {
            const bad = w.weeks.filter((wk) => wk.filter((s) => papad(s, w.lib)).length > 2).length;
            return { pass: bad === 0, got: `${bad} of ${w.weeks.length} weeks have more` };
          },
          highlights: (slot, lib) => papad(slot, lib),
        },
        someWeekPicks('Some week has Murukku', hasDish('Murukku'), 0),
      ],
    },
    {
      kind: 'plan',
      id: 'when-curry-extras-cap-full',
      group: 'Pairings',
      name: 'A conditional extra that would break the extras cap is left out',
      why: `${PAPAD_RULE}Rice is a breakfast dish that usually comes with Pickle and Curd, which fill the breakfast cap of 2 extras, and usually with Papad when the meal has Sambar: Papad cannot fit, so it is left out and reported as a soft problem, never a third extra, and Rice and Sambar breakfasts are as many as without the link. The bug: the planner judged Sambar with the Papad it would bring, so a full extras cap moved the curry away.`,
      rules: papadWhen({ curry: ['Sambar'] }, { strength: 'usually' }),
      given: (lib) => [
        mealRule(lib.dish('Rice'), ['breakfast']),
        caseLink(lib.dish('Rice'), { mode: 'comes', to: 'extra', values: [dishId(lib, 'Pickle')], strength: 'usually' }),
        caseLink(lib.dish('Rice'), { mode: 'comes', to: 'extra', values: [dishId(lib, 'Curd')], strength: 'usually' }),
        CURRY_AT_EVERY_MEAL,
        riceWithSambar(lib, 'sometimes'),
      ],
      expect: [
        nearNoRulesRiceSambar,
        nonePicked('No Rice and Sambar breakfast has more than 2 extras', riceSambar, (s) => s.extra_ids.length > 2),
        noHardProblems(),
        reportedWhereMissing('Every Rice and Sambar breakfast without Papad has a soft problem naming the link, and some has one', riceSambar, 'Papad'),
      ],
    },
    {
      kind: 'plan',
      id: 'when-curry-locked-curry',
      group: 'Locks and picks',
      name: 'A locked Sambar meets the condition',
      why: `${PAPAD_RULE}Monday lunch is locked to Rice and Sambar: the locked curry meets the condition, so the meal has Papad in every week, and so does every other Rice and Sambar meal. Passes today because the planner ignores the condition and brings Papad to every Rice meal, which is also what this case wants; it guards the condition once the planner reads it.`,
      rules: papadOnSambar,
      given: () => [CURRY_AT_EVERY_MEAL],
      pins: { 'monday-lunch': { base_id: TEST_LIBRARY.dish('Rice').id, curry_id: TEST_LIBRARY.dish('Sambar').id } },
      expect: [mondayLunchHas('Papad', true), EVERY_RICE_SAMBAR_HAS_PAPAD],
    },
    {
      kind: 'plan',
      id: 'when-curry-locked-other-curry',
      group: 'Locks and picks',
      name: 'A locked other curry does not meet the condition',
      why: `${PAPAD_RULE}Monday lunch is locked to Rice and Rasam: the locked curry does not meet the condition, so the link never brings Papad to it, while other Rice and Sambar meals still have Papad.`,
      rules: papadOnSambar,
      given: () => [CURRY_AT_EVERY_MEAL],
      pins: { 'monday-lunch': { base_id: TEST_LIBRARY.dish('Rice').id, curry_id: TEST_LIBRARY.dish('Rasam').id } },
      expect: [mondayLunchHas('Papad', false), EVERY_RICE_SAMBAR_HAS_PAPAD],
    },
    {
      kind: 'plan',
      id: 'when-curry-lock-nudge',
      group: 'Locks and picks',
      name: 'Locking Papad with Rice makes Sambar more likely',
      why: `${PAPAD_RULE}Monday lunch is locked to Rice with Papad: the user locked the dish the link brings, so the planner nudges that meal toward Sambar, the curry the link waits for. Monday lunch has Sambar in at least 6 of 8 weeks, and in more weeks than with the same locks and no link, though Sambar is strongly avoided. The bug: the search never let the link move the curry; the only pull toward Sambar was that a Papad the link would bring stops paying "Curries, subzis and extras only when a rule asks", too weak to beat a Strongly avoided curry.`,
      rules: papadOnSambar,
      given: (lib) => [CURRY_AT_EVERY_MEAL, avoidSambarStrongly(lib)],
      pins: { 'monday-lunch': { base_id: TEST_LIBRARY.dish('Rice').id, extra_ids: [TEST_LIBRARY.dish('Papad').id] } },
      expect: [mondayLunchSambarNudged()],
    },
    {
      kind: 'plan',
      id: 'when-curry-blind-link-pick',
      group: 'Pairings',
      name: "A conditional link does not steer another link's curry",
      why: `${PAPAD_RULE}Rice always comes with Sambar or Rasam, Papad is never at dinner, and Rice comes with Papad when the curry is Sambar: Rice and Sambar dinners stay within x1.5 of the count without the Papad link, and every Rice and Sambar lunch has Papad. The bug: the pick between Sambar and Rasam was scored with the Papad the conditional link would bring, so at dinner the missing Papad ranked Sambar down and Rice dinners never had Sambar.`,
      rules: papadOnSambar,
      given: (lib) => [
        caseLink(lib.dish('Rice'), { mode: 'comes', to: 'curry', values: [dishId(lib, 'Sambar'), dishId(lib, 'Rasam')] }),
        papadNotAtDinner(lib),
        preferRiceStrongly(lib),
      ],
      expect: [
        nearNoRules('Rice with Sambar at dinner', allOf(riceSambar, (s) => s.meal_slot === 'dinner')),
        everyPicked('Every Rice lunch with Sambar has Papad', allOf(riceSambar, (s) => s.meal_slot === 'lunch'), papad),
      ],
    },
    {
      kind: 'plan',
      id: 'when-curry-retried-after-polish',
      group: 'Pairings',
      name: 'A conditional side kept out by an extra comes once the extra goes',
      why: `${PAPAD_RULE}Rice always comes with Sambar, Papad is never with Pickle, Pickle is slightly preferred, and Rice comes with Papad when the curry is Sambar: every Rice and Sambar meal has Papad, or the Pickle that keeps it out. The bug: Papad was refused while a passing Pickle sat in the meal, and when the final clean-up then dropped the Pickle nothing brought Papad again, leaving a Rice and Sambar meal with neither.`,
      rules: papadOnSambar,
      given: (lib) => [
        CURRY_AT_EVERY_MEAL,
        caseLink(lib.dish('Rice'), { mode: 'comes', to: 'curry', values: [dishId(lib, 'Sambar')] }),
        {
          name: 'Papad never with Pickle',
          spec: { template: 'avoid_with', params: { match: is('id', dishId(lib, 'Papad')), with: is('id', dishId(lib, 'Pickle')), strength: 'must' } },
        },
        { name: 'Prefer Pickle', spec: { template: 'prefer', params: { match: is('id', dishId(lib, 'Pickle')), direction: 'prefer', weight: 1 } } },
      ],
      expect: [everyPicked('Every Rice meal with Sambar has Papad or Pickle', riceSambar, (s, lib) => papad(s, lib) || hasDish('Pickle')(s, lib))],
    },
  ];
}

/** A hand-written "Never include Papad at dinner", as the Rules page stores it (not an owned rule). */
const papadNotAtDinner = (lib: CaseLibrary): CaseRule => ({
  name: 'Never include Papad at dinner',
  spec: { template: 'exclude', params: { match: is('id', dishId(lib, 'Papad')), scope: { meals: ['dinner'] }, strength: 'must' } },
});

/** Prefer Rice, Strongly: makes Rice common enough at each meal to count its curries. */
const preferRiceStrongly = (lib: CaseLibrary): CaseRule => ({
  name: 'Prefer Rice',
  spec: { template: 'prefer', params: { match: is('id', dishId(lib, 'Rice')), direction: 'prefer', weight: 4 } },
});

/** The meals `where` picks stay within x1.5 of the count without the case's rules, which must itself be at least MIN_BASELINE. */
const nearNoRules = (what: string, where: Pick): PlanExpectation => ({
  says: `${what} is planned about as often as without the case's rules (which has at least ${MIN_BASELINE} such meals)`,
  check: (w, ctx) => {
    const total = mealsPicked(w, where).length;
    const base = mealsPicked(ctx.baseline(), where).length;
    const pass = base >= MIN_BASELINE && total >= base / 1.5 && total <= base * 1.5;
    return { pass, got: `${total} (${base} without the rules)` };
  },
  highlights: (slot, lib) => where(slot, lib),
});

/** Avoid Sambar, Strongly: a push on the curry firmer than "only when a rule asks" and softer than an Always link. */
const avoidSambarStrongly = (lib: CaseLibrary): CaseRule => ({
  name: 'Avoid Sambar',
  spec: { template: 'prefer', params: { match: is('id', dishId(lib, 'Sambar')), direction: 'avoid', weight: 4 } },
});

/** Monday lunch has Sambar in at least 6 of 8 weeks, and in more weeks than with the same pins and no case rules. */
function mondayLunchSambarNudged(): PlanExpectation {
  const isMondayLunch = (s: PlanSlot) => s.day === 'monday' && s.meal_slot === 'lunch';
  const weeksWithSambar = (w: CaseWeeks) => w.weeks.filter((wk) => wk.some((s) => isMondayLunch(s) && curryIs('Sambar')(s, w.lib))).length;
  return {
    says: 'Monday lunch has Sambar in at least 6 of 8 weeks, and in more weeks than without the link',
    check: (w, ctx) => {
      const k = weeksWithSambar(w);
      const base = weeksWithSambar(ctx.baseline());
      return { pass: k >= (w.weeks.length * 3) / 4 && k > base, got: `${k} of ${w.weeks.length} weeks (${base} without the link)` };
    },
    highlights: (slot) => isMondayLunch(slot),
  };
}

/** `recordsOf` numbers a case's own rules first, so its first rule is stored with id 1. */
const OWN_RULE_ID = 1;

/**
 * Every meal `where` picks that lacks `dish` has a soft problem from the case's first rule naming `dish` in
 * that meal; at least one such meal exists, so the check is not empty.
 */
function reportedWhereMissing(says: string, where: Pick, dish: string): PlanExpectation {
  const missing = (s: PlanSlot, lib: CaseLibrary) => where(s, lib) && !idsOf(s).includes(dishId(lib, dish));
  return {
    says,
    check: (w) => {
      const id = dishId(w.lib, dish);
      let n = 0;
      let reported = 0;
      w.weeks.forEach((wk, k) => {
        for (const s of wk) {
          if (!missing(s, w.lib)) continue;
          n++;
          const named = w.soft[k].some((j) => j.ruleId === OWN_RULE_ID && j.group.componentId === id && j.group.day === s.day && j.group.meal === s.meal_slot);
          if (named) reported++;
        }
      });
      return { pass: n > 0 && reported === n, got: `${reported} of ${n} meals without ${dish} reported` };
    },
    highlights: missing,
  };
}

/** The pinned Monday lunch has the dish in every week, or in none. */
function mondayLunchHas(dish: string, has: boolean, meal = 'pinned Monday lunch'): PlanExpectation {
  const at = (w: CaseWeeks, wk: PlanSlot[]) => {
    const slot = wk.find((x) => x.day === 'monday' && x.meal_slot === 'lunch');
    return slot !== undefined && idsOf(slot).includes(w.lib.dish(dish).id);
  };
  return {
    says: has ? `The ${meal} has ${dish} in every week` : `The ${meal} never has ${dish} from the link`,
    check: (w) => {
      const k = w.weeks.filter((wk) => at(w, wk)).length;
      return { pass: has ? k === w.weeks.length : k === 0, got: `${k} of ${w.weeks.length} weeks` };
    },
    highlights: (slot) => slot.day === 'monday' && slot.meal_slot === 'lunch',
  };
}

// ─── Links over a library's own parts ────────────────────────────────────────────

const OWN = (id: number, name: string, part_id: number): ComponentRecord & { part_id: number } => ({
  ...fields(), id, name, componentType: 'base', part_id,
});
// Ids out of position order: nothing may lean on a part's id to find its place.
const MAIN = 7;
const SIDE = 3;
const DESSERT = 5;
const MEAL_PARTS = [{ id: MAIN, name: 'Main', varied: true }, { id: SIDE, name: 'Side', varied: true }, { id: DESSERT, name: 'Dessert', varied: false }];
const MEAL_DISHES = [OWN(1, 'Biryani', MAIN), OWN(2, 'Pulao', MAIN), OWN(11, 'Raita', SIDE), OWN(12, 'Salan', SIDE), OWN(21, 'Kheer', DESSERT)];
const MEAL_LIBRARY = libraryOf(MEAL_DISHES, { parts: MEAL_PARTS });
const mealOwner = (name: string) => {
  const d = MEAL_LIBRARY.dish(name) as ComponentRecord & { part_id: number };
  return { id: d.id, name: d.name, part_id: d.part_id };
};
const holds = (partId: number, id: number) => (s: PartSlot) => partDishes(s, partId).includes(id);

// A Main, a Curry and an Extra: the extra is below the curry, so its link to the curry is a "served with".
const CURRY = 8;
const EXTRA = 9;
const SPREAD_PARTS = [{ id: MAIN, name: 'Main', varied: true }, { id: CURRY, name: 'Curry', varied: true }, { id: EXTRA, name: 'Extra', varied: false }];
const SPREAD_LIBRARY = libraryOf(
  [OWN(1, 'Rice', MAIN), OWN(31, 'Dal', CURRY), OWN(32, 'Kurma', CURRY), OWN(41, 'Papad', EXTRA), OWN(42, 'Pickle', EXTRA)],
  { parts: SPREAD_PARTS },
);

const PART_LINK_CASES: RuleCase[] = [
  {
    kind: 'plan',
    id: 'comes-with-two-sides',
    group: 'Pairings',
    name: 'A Main comes with two different Sides',
    why: 'A dish can own several links: Biryani has two Always "comes with" links, one to Raita and one to Salan, and a meal with Biryani gets both Sides, one from each link. Pulao has none and gets no Side.',
    library: MEAL_LIBRARY,
    rules: () => ['Raita', 'Salan'].map((n) => linkRule(mealOwner('Biryani'), { mode: 'comes', target: { part: SIDE, kind: 'dish' }, values: [MEAL_LIBRARY.dish(n).id] }, MEAL_PARTS)),
    expect: [
      everyPartMeal('Every meal with Biryani has Raita and Salan', holds(MAIN, 1), (s) => holds(SIDE, 11)(s) && holds(SIDE, 12)(s)),
      everyPartMeal('Every meal with Pulao has no Side', holds(MAIN, 2), (s) => partDishes(s, SIDE).length === 0),
      noHardProblems(),
    ],
  },
  {
    kind: 'plan',
    id: 'comes-with-meets-a-general-side-rule',
    group: 'Pairings',
    name: 'A Main link to one Side also satisfies "every meal has a Side"',
    why: 'A general rule asks for a Side in every meal and Biryani comes with Raita: a Biryani meal gets Raita and no second Side, because the link already satisfies the general rule; every meal holds exactly one Side.',
    library: MEAL_LIBRARY,
    rules: () => [
      { name: 'Every meal has a Side', spec: { template: 'require', params: { match: is('part', SIDE), min: 1, strength: 'must' } } },
      linkRule(mealOwner('Biryani'), { mode: 'comes', target: { part: SIDE, kind: 'dish' }, values: [11] }, MEAL_PARTS),
    ],
    expect: [
      everyPartMeal('Every meal with Biryani has exactly Raita as its Side', holds(MAIN, 1), (s) => partDishes(s, SIDE).join() === '11'),
      everyPartMeal('Every meal has one Side', () => true, (s) => partDishes(s, SIDE).length === 1),
      noHardProblems(),
    ],
  },
  {
    kind: 'plan',
    id: 'upward-link-adds-the-extra-with-its-curry',
    group: 'Pairings',
    name: 'An extra that comes with a curry is in every meal with that curry',
    why: 'Papad (an Extra) "comes with" Dal (a Curry): the link points up the parts, so it is stored as "when Dal is in the meal, Papad is added". Papad is in every meal that has Dal and in no other, though Kurma is the other curry in the library.',
    library: SPREAD_LIBRARY,
    defaults: false,
    // Dal is for lunch and Kurma for dinner, so some meals have each curry.
    given: () => [
      { name: 'Extras only when asked', spec: { template: 'prefer', params: { match: is('part', EXTRA), direction: 'avoid', weight: 1 } } },
      mealRule({ id: 31, name: 'Dal' }, ['lunch']),
      { name: 'Lunch has Dal', spec: { template: 'require', params: { match: is('id', 31), min: 1, scope: { meals: ['lunch'] }, strength: 'must' } } },
      { name: 'Dinner has a curry', spec: { template: 'require', params: { match: is('part', CURRY), min: 1, scope: { meals: ['dinner'] }, strength: 'must' } } },
    ],
    rules: () => {
      const papad = { id: 41, name: 'Papad', part_id: EXTRA };
      return [linkRule(papad, { mode: bringMode(EXTRA, CURRY, SPREAD_PARTS), target: { part: CURRY, kind: 'dish' }, values: [31] }, SPREAD_PARTS)];
    },
    expect: [
      everyPartMeal('Every meal with Dal has Papad', holds(CURRY, 31), holds(EXTRA, 41)),
      everyPartMeal('Every meal without Dal has no Papad', (s) => !holds(CURRY, 31)(s), (s) => !holds(EXTRA, 41)(s)),
      everyPartMeal('Meals with Kurma and not Dal exist and have no Papad', (s) => holds(CURRY, 32)(s) && !holds(CURRY, 31)(s), (s) => !holds(EXTRA, 41)(s)),
      noHardProblems(),
    ],
  },
  {
    kind: 'plan',
    id: 'link-pointing-the-wrong-way-is-named',
    group: 'Pairings',
    name: 'A link that points the wrong way is named and not planned',
    why: 'After the parts are reordered, Raita (a Side) "comes with" Biryani (a Main, now above the Side): a comes link may only bring a part below its owner, so the link is skipped and named as a rule issue instead of being planned, and the plan is the one the library has without it: no Side at all.',
    library: MEAL_LIBRARY,
    rules: () => [linkRule(mealOwner('Raita'), { mode: 'comes', target: { part: MAIN, kind: 'dish' }, values: [1] }, MEAL_PARTS)],
    issues: ['points to Main, which is no longer below Side'],
    expect: [
      ruleIssueNamed('points to Main, which is no longer below Side'),
      everyPartMeal('Every meal has no Side', () => true, (s) => partDishes(s, SIDE).length === 0),
      noHardProblems(),
    ],
  },
];

export const COMES_WITH_CASES: RuleCase[] = [...PAIRING_CASES, ...conditionalCases(), ...PART_LINK_CASES];
