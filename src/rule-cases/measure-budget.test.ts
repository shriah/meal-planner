// Measurement only: how many search steps each rule case and the seeded library need. Skipped unless
// MEASURE_BUDGET is set (it runs for a long time): MEASURE_BUDGET=1 npx vitest run src/rule-cases/measure-budget.test.ts --silent=false
import { describe, it } from 'vitest';
import { materializePooriSeed, materializeSeedComponents, type SeedCategoryLookup } from '@/db/seed-data';
import { planWeek, type ComponentLike } from '@/planner';
import { compileRules, defaultRules, linkRule, type RuleRecord } from '@/rules';
import { ALL_CASES } from './cases';
import { libraryOf, TEST_LIBRARY } from './library';
import { failsWithoutSubject, recordsOf, runPlanCase, type CaseBudget } from './run';
import type { PlanCase } from './types';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const BUDGETS = [500, 1000, 2000, 4000, 8000, 16000, 32000, 64000];
const at = (maxIterations: number): CaseBudget => ({ timeLimitMs: Infinity, maxIterations, plateauIterations: 3000 });
const CREATED = '2026-01-01T00:00:00.000Z';

function measureCase(c: PlanCase) {
  const lib = c.dishes?.length ? libraryOf([...TEST_LIBRARY.dishes, ...c.dishes], TEST_LIBRARY.categories) : TEST_LIBRARY;
  const records = recordsOf(c, c.rules(lib), c.given?.(lib) ?? []);
  const { constraints } = compileRules(records, {
    components: new Set(lib.dishes.map((d) => d.id)),
    baseCategories: new Set(lib.categories.filter((k) => k.kind === 'base').map((k) => k.id)),
    extraCategories: new Set(lib.categories.filter((k) => k.kind === 'extra').map((k) => k.id)),
  });
  const pairs = constraints.filter((k) => k.kind === 'pair').length;
  let need: number | 'none' = 'none';
  let used = 0;
  for (const b of BUDGETS) {
    const budget = at(b);
    if (runPlanCase(c, budget).status === 'pass' && failsWithoutSubject(c, budget).fails) {
      need = b;
      used = Math.max(...SEEDS.map((seed) => planWeek({ library: lib.dishes, constraints }, { ...budget, seed, pins: c.pins }).stats.iterations));
      break;
    }
  }
  return { id: c.id, dishes: lib.dishes.length, constraints: constraints.length, pairs, need, used };
}

describe.skipIf(!process.env.MEASURE_BUDGET)('measure search budget', () => {
  it('rule cases', { timeout: 3 * 60 * 60 * 1000 }, () => {
    const rows = ALL_CASES.map((c) => (c.known ? { id: c.id, skipped: true as const } : measureCase(c)));
    const lines = ['| case | dishes | constraints | pairs | need | max iterations used |', '|---|---|---|---|---|---|'];
    for (const r of rows) {
      lines.push('skipped' in r ? `| ${r.id} | skipped (known) | | | | |` : `| ${r.id} | ${r.dishes} | ${r.constraints} | ${r.pairs} | ${r.need} | ${r.used} |`);
    }
    console.log(`\nRULE CASES\n${lines.join('\n')}\n`);
  });

  it('seeded library', { timeout: 3 * 60 * 60 * 1000 }, () => {
    const CAT = { base: { 'rice-based': 1, 'bread-based': 2, other: 3 }, extra: { liquid: 11, crunchy: 12, condiment: 13, dairy: 14, sweet: 15 } } satisfies SeedCategoryLookup;
    const library: ComponentLike[] = [...materializeSeedComponents(CAT), materializePooriSeed(CAT)].map((c, i) => ({
      ...c, id: 100 + i, frequency: i % 7 === 0 ? 'frequent' : i % 11 === 0 ? 'rare' : 'normal',
    }));
    const dish = (name: string) => {
      const d = library.find((x) => x.name === name);
      if (!d) throw new Error(`no seed dish ${name}`);
      return d;
    };
    const rice = dish('Plain Rice'), sambar = dish('Sambar'), papad = dish('Papad'), idli = dish('Idli'), chutney = dish('Coconut Chutney');
    const links = [
      linkRule(rice, { mode: 'comes', target: 'curry_dish', values: [sambar.id] }),
      linkRule(rice, { mode: 'comes', target: 'extra_dish', values: [papad.id], when: { curry: [sambar.id] } }),
      linkRule(idli, { mode: 'comes', target: 'extra_dish', values: [chutney.id] }),
    ];
    const records: RuleRecord[] = [...links, ...defaultRules()].map((r, i) => ({ ...r, id: i + 1, enabled: true, created_at: CREATED }));
    const { constraints, issues } = compileRules(records, {
      components: new Set(library.map((d) => d.id)),
      baseCategories: new Set([1, 2, 3]),
      extraCategories: new Set([11, 12, 13, 14, 15]),
    });
    const pairs = constraints.filter((k) => k.kind === 'pair').length;
    const lines = ['| seed | iterations | stop | total ms | ms per iteration |', '|---|---|---|---|---|'];
    for (const seed of SEEDS) {
      const r = planWeek({ library, constraints }, { seed, timeLimitMs: Infinity, maxIterations: 200_000, plateauIterations: 3000 });
      lines.push(`| ${seed} | ${r.stats.iterations} | ${r.stats.stopReason} | ${r.stats.totalMs.toFixed(0)} | ${(r.stats.totalMs / Math.max(1, r.stats.iterations)).toFixed(4)} |`);
    }
    console.log(`\nSEEDED LIBRARY: ${library.length} dishes, ${constraints.length} constraints, ${pairs} pairs, ${issues.length} issues\n${lines.join('\n')}\n`);
  });
});
