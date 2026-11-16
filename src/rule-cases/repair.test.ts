// The upper side of the bound on the repair loop after the search (`REPAIR_ROUNDS`), over the sets the repair snapshot
// pins: the loop ends on its own, well before the bound. Here rather than in solver.test.ts because planner files may
// not import the rules module. The lower side (a second round can improve) is in solver.test.ts: no seed 1-50 of the
// seeded library with links gives a better week with two rounds than with one, so it is a built model there.
import { describe, expect, it } from 'vitest';
import { planWeek } from '@/planner';
import { REPAIR_ROUNDS } from '@/planner/solver';
import { compileRules } from '@/rules';
import { ALL_CASES } from './cases';
import { knownIds, libraryFor, recordsOf } from './run';
import { seededConstraints, seededLibrary } from './seeded-library';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const LONG = { timeout: 10 * 60 * 1000 };

const caseModel = (id: string) => {
  const c = ALL_CASES.find((x) => x.id === id);
  if (!c) throw new Error(`no rule case ${id}`);
  const lib = libraryFor(c);
  const { constraints } = compileRules(recordsOf(c, c.rules(lib), c.given?.(lib) ?? []), knownIds(lib));
  return { library: lib.dishes, constraints, pins: c.pins };
};

describe('repair loop', () => {
  it('is bounded by ten rounds', () => {
    expect(REPAIR_ROUNDS).toBe(10);
  });

  it('rounds stop when nothing is kept (upper side of the bound)', LONG, () => {
    const library = seededLibrary();
    for (const withLinks of [true, false]) {
      const constraints = seededConstraints(library, withLinks);
      for (const seed of SEEDS) {
        const r = planWeek({ library, constraints }, { seed, timeLimitMs: Infinity });
        expect(r.stats.repairRounds).toBeGreaterThan(0);
        expect(r.stats.repairRounds).toBeLessThan(REPAIR_ROUNDS);
      }
    }
    for (const id of ['when-curry-brings', 'when-curry-retried-after-polish', 'when-curry-lock-nudge']) {
      const { library: lib, constraints, pins } = caseModel(id);
      for (const seed of SEEDS) {
        const r = planWeek({ library: lib, constraints }, { seed, pins, timeLimitMs: Infinity });
        expect(r.stats.repairRounds).toBeLessThan(REPAIR_ROUNDS);
      }
    }
  });

  it('re-pick does not cycle: a not-worse re-pick every round still ends the loop early', LONG, () => {
    const { library: lib, constraints, pins } = caseModel('limit-ranks-a-links-dishes');
    for (const seed of SEEDS) {
      const r = planWeek({ library: lib, constraints }, { seed, pins, timeLimitMs: Infinity });
      expect(r.stats.repairRounds).toBeLessThan(REPAIR_ROUNDS);
    }
  });
});
