// Pins the exact weeks the planner gives at its default budget, so reworking its post-search clean-up can be shown to
// change nothing. Plain slot data, seeds 1-8. Time never ends a search here, so a slow machine cannot change a snapshot.
import { describe, expect, it } from 'vitest';
import { planWeek } from '@/planner';
import { compileRules } from '@/rules';
import { ALL_CASES } from './cases';
import { knownIds, libraryFor, recordsOf, rulePartsOf } from './run';
import { seededConstraints, seededLibrary } from './seeded-library';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const LONG = { timeout: 10 * 60 * 1000 };
const CASE_IDS = ['when-curry-brings', 'when-curry-retried-after-polish', 'when-curry-lock-nudge', 'limit-ranks-a-links-dishes'];

describe('repair: today\'s weeks', () => {
  it('seeded library, defaults and three links', LONG, () => {
    const library = seededLibrary();
    const constraints = seededConstraints(library, true);
    expect(SEEDS.map((seed) => planWeek({ library, constraints }, { seed, timeLimitMs: Infinity }).slots)).toMatchSnapshot();
  });

  it('rule cases that exercise the clean-up', LONG, () => {
    const weeks = CASE_IDS.map((id) => {
      const c = ALL_CASES.find((x) => x.id === id);
      if (!c) throw new Error(`no rule case ${id}`);
      const lib = libraryFor(c);
      const { constraints } = compileRules(recordsOf(c, c.rules(lib), c.given?.(lib) ?? []), knownIds(lib), rulePartsOf(lib));
      return { id, weeks: SEEDS.map((seed) => planWeek({ library: lib.dishes, constraints }, { seed, pins: c.pins, timeLimitMs: Infinity }).slots) };
    });
    expect(weeks).toMatchSnapshot();
  });

  it('seeded library, defaults only', LONG, () => {
    const library = seededLibrary();
    const constraints = seededConstraints(library, false);
    expect(SEEDS.map((seed) => planWeek({ library, constraints }, { seed, timeLimitMs: Infinity }).slots)).toMatchSnapshot();
  });
});
