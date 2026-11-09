import { linkRule, mealRule } from '@/rules';
import type { BaseRecord, ComponentRecord, CurryRecord, ExtraRecord } from '@/types/component';
import { eachPlanned, everyMealWith, everyMealWithOneOf, idsOf, nearNoRulesCount, neverWith, noHardProblems, plannedAtLeast, yieldsTo } from '../expect';
import type { PlanExpectation, RuleCase } from '../types';
import { TEST_LIBRARY } from '../library';
import { CURRY_AT_EVERY_MEAL } from './days-meals';

const CREATED = '2026-01-01T00:00:00.000Z';
const fields = () => ({ dietary_tags: ['veg' as const], regional_tags: [], occasion_tags: [], frequency: 'normal' as const, created_at: CREATED });

// Case-only dishes (ids from 900). Pepper Rasam is an extra: the test library already has a curry named Rasam.
const IDIYAPPAM: BaseRecord = { ...fields(), id: 900, name: 'Idiyappam', componentType: 'base', base_category_id: 2, base_type: 'other' };
const STEW_VEG: CurryRecord = { ...fields(), id: 901, name: 'Kerala Stew (Veg)', componentType: 'curry', curry_category: 'stew' };
const STEW_NON_VEG: CurryRecord = { ...fields(), id: 902, name: 'Kerala Stew (Non-Veg)', componentType: 'curry', curry_category: 'stew' };
const MUTTON_CURRY: CurryRecord = { ...fields(), id: 903, name: 'Mutton Curry', componentType: 'curry', curry_category: 'mutton' };
const PEPPER_RASAM: ExtraRecord = { ...fields(), id: 904, name: 'Pepper Rasam', componentType: 'extra', extra_category_id: 11, extra_category: 'condiment' };
const DISHES: ComponentRecord[] = [IDIYAPPAM, STEW_VEG, STEW_NON_VEG, MUTTON_CURRY, PEPPER_RASAM];

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

export const COMES_WITH_CASES: RuleCase[] = [
  {
    kind: 'plan',
    id: 'comes-with-either-stew',
    group: 'Pairings',
    name: 'Comes with either of two stews',
    why: `${REPORT}Idiyappam comes with Kerala Stew (Veg) or Kerala Stew (Non-Veg): every Idiyappam meal has one of them, and over the weeks both turn up.`,
    dishes: DISHES,
    rules: (lib) => [linkRule(IDIYAPPAM, { mode: 'comes', target: 'curry_dish', values: STEWS.map((n) => lib.dish(n).id) })],
    given: () => [mealRule(IDIYAPPAM, ['breakfast'])],
    expect: [
      everyMealWithOneOf('Idiyappam', STEWS),
      eachPlanned(STEWS, 'Idiyappam'),
      nearNoRulesCount('Idiyappam'),
      noHardProblems(),
    ],
    known: 'The planner always brings the first candidate in library order, so the second stew never comes with Idiyappam (choosing between the dishes of a link is Task 4).',
  },
  {
    kind: 'plan',
    id: 'comes-with-curry-to-extra',
    group: 'Pairings',
    name: 'A curry comes with an extra',
    why: `${REPORT}a curry can bring an extra: Mutton Curry comes with Pepper Rasam wherever it is planned.`,
    dishes: DISHES,
    rules: () => [linkRule(MUTTON_CURRY, { mode: 'comes', target: 'extra_dish', values: [PEPPER_RASAM.id] })],
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
      linkRule(lib.dish('Rice'), { mode: 'comes', target: 'extra_dish', values: [lib.dish('Papad').id] }),
      linkRule(MUTTON_CURRY, { mode: 'comes', target: 'extra_dish', values: [PEPPER_RASAM.id] }),
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
      linkRule(lib.dish('Idli'), { mode: 'comes', target: 'extra_dish', values: [lib.dish('Coconut Chutney').id] }),
      linkRule(lib.dish('Idli'), { mode: 'comes', target: 'extra_dish', values: [lib.dish('Tomato Chutney').id] }),
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
    rules: () => [linkRule(IDIYAPPAM, { mode: 'comes', target: 'curry_dish', values: [STEW_VEG.id], strength: 'usually' })],
    given: () => [mealRule(IDIYAPPAM, ['breakfast'])],
    expect: [
      nearNoRulesCount('Idiyappam'),
      {
        says: 'Kerala Stew (Veg) is in at least half of the Idiyappam meals',
        check: (w) => {
          const idi = w.lib.dish('Idiyappam').id;
          const stew = w.lib.dish('Kerala Stew (Veg)').id;
          const meals = w.weeks.flat().filter((s) => idsOf(s).includes(idi));
          const k = meals.filter((s) => idsOf(s).includes(stew)).length;
          return { pass: meals.length > 0 && k * 2 >= meals.length, got: `${k} of ${meals.length}` };
        },
        highlights: (slot, lib) => idsOf(slot).includes(lib.dish('Idiyappam').id),
      },
    ],
    known: 'A side brought by a softer pairing still counts toward the variety default, which holds Idiyappam back (fixed in Task 5).',
  },
  {
    kind: 'plan',
    id: 'comes-with-curry-type',
    group: 'Pairings',
    name: 'Comes with a curry type',
    why: `${REPORT}a link can name a curry type: Idiyappam comes with a stew, and either stew meets it.`,
    dishes: DISHES,
    rules: () => [linkRule(IDIYAPPAM, { mode: 'comes', target: 'curry_category', values: ['stew'] })],
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
      linkRule(IDIYAPPAM, { mode: 'comes', target: 'curry_dish', values: [STEW_VEG.id] }),
      linkRule(STEW_VEG, { mode: 'comes', target: 'extra_dish', values: [PEPPER_RASAM.id] }),
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
      linkRule(lib.dish('Sambar'), { mode: 'with', target: 'base_dish', values: [lib.dish('Idli').id, lib.dish('Dosa').id] }),
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
    rules: () => [linkRule(IDIYAPPAM, { mode: 'with', target: 'curry_dish', values: [STEW_VEG.id, STEW_NON_VEG.id] })],
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
      linkRule(IDIYAPPAM, { mode: 'comes', target: 'curry_dish', values: [STEW_VEG.id] }),
      linkRule(IDIYAPPAM, { mode: 'comes', target: 'curry_dish', values: [MUTTON_CURRY.id] }),
    ],
    given: () => [mealRule(IDIYAPPAM, ['breakfast'])],
    expect: [
      plannedAtLeast('Idiyappam', 4),
      everyMealWith('Idiyappam', ['Kerala Stew (Veg)']),
      yieldsTo('Idiyappam', 'Kerala Stew (Veg)'),
      noHardProblems(),
    ],
  },
];
