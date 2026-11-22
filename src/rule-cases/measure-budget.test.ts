// Measurement only: how many search steps each rule case and the seeded library need. Skipped unless
// MEASURE_BUDGET is set (it runs for a long time): MEASURE_BUDGET=1 npx vitest run src/rule-cases/measure-budget.test.ts --silent=false
import { describe, it } from 'vitest';
import { planWeek, type ComponentLike } from '@/planner';
import { compileRules, linkRule } from '@/rules';
import { ALL_CASES } from './cases';
import { failsWithoutSubject, knownIds, libraryFor, recordsOf, rulePartsOf, runPlanCase, type CaseBudget } from './run';
import { constraintsFor, seedDish, seededLibrary, seededLinks } from './seeded-library';
import type { PlanCase } from './types';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const BUDGETS = [50, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000];
const at = (maxIterations: number): CaseBudget => ({ timeLimitMs: Infinity, maxIterations, plateauIterations: 3000 });

function measureCase(c: PlanCase) {
  const lib = libraryFor(c);
  const records = recordsOf(c, c.rules(lib), c.given?.(lib) ?? []);
  const { constraints } = compileRules(records, knownIds(lib), rulePartsOf(lib));
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
    const full = seededLibrary();
    const dishIn = seedDish;
    const REQUIRED = ['Plain Rice', 'Sambar', 'Papad', 'Idli', 'Coconut Chutney'];
    // The library cut to about n dishes: the dishes the links name stay, and each part keeps its share.
    const cut = (n: number): ComponentLike[] => {
      if (n >= full.length) return full;
      const keep = new Set(REQUIRED.map((r) => dishIn(full, r).id));
      for (const type of ['base', 'curry', 'subzi', 'extra'] as const) {
        const of = full.filter((d) => d.componentType === type);
        const want = Math.max(Math.round((of.length * n) / full.length), of.filter((d) => keep.has(d.id)).length);
        const rest = of.filter((d) => !keep.has(d.id));
        const need = want - of.filter((d) => keep.has(d.id)).length;
        for (let k = 0; k < need; k++) keep.add(rest[Math.floor(((k + 0.5) * rest.length) / need)].id);
      }
      return full.filter((d) => keep.has(d.id));
    };
    const light = seededLinks;
    // 15 more links: six other bases and six curries each bring an extra, three more bring a curry.
    const heavy = (lib: ComponentLike[]) => {
      const d = (name: string) => dishIn(lib, name);
      const others = lib.filter((x) => x.componentType === 'base' && x.name !== 'Plain Rice' && x.name !== 'Idli').slice(0, 6);
      const curries = lib.filter((x) => x.componentType === 'curry' && x.name !== 'Sambar').slice(0, 6);
      const extras = [d('Papad').id, d('Coconut Chutney').id];
      return [
        ...light(lib),
        ...others.map((b, i) => linkRule(b, { mode: 'comes', target: 'extra_dish', values: [extras[i % 2]] })),
        ...curries.map((c, i) => linkRule(c, { mode: 'comes', target: 'extra_dish', values: [extras[i % 2]] })),
        ...others.slice(0, 3).map((b, i) => linkRule(b, { mode: 'comes', target: 'curry_dish', values: [curries[i].id] })),
      ];
    };
    const measure = (lib: ComponentLike[], links: ReturnType<typeof light>, seeds: number[]) => {
      const { constraints, issues } = constraintsFor(lib, links);
      const runs = seeds.map((seed) => planWeek({ library: lib, constraints }, { seed, timeLimitMs: Infinity, maxIterations: 200_000, plateauIterations: 3000 }));
      const its = runs.map((r) => r.stats.iterations).sort((a, b) => a - b);
      const ms = runs.reduce((t, r) => t + r.stats.totalMs, 0);
      const stops = new Set(runs.map((r) => r.stats.stopReason));
      return {
        dishes: lib.length, constraints: constraints.length, pairs: constraints.filter((k) => k.kind === 'pair').length, issues: issues.length,
        mean: Math.round(its.reduce((a, b) => a + b, 0) / its.length), p95: its[Math.floor(its.length * 0.95)], max: its[its.length - 1],
        msPerIt: ms / its.reduce((a, b) => a + b, 0), stops: [...stops].join('/'),
      };
    };
    const SEEDS60 = Array.from({ length: 60 }, (_, i) => i + 1);
    const head = '| dishes | links | constraints | pairs | seeds | mean it | p95 it | max it | stop | ms per iteration |\n|---|---|---|---|---|---|---|---|---|---|';
    const row = (m: ReturnType<typeof measure>, links: number, seeds: number) =>
      `| ${m.dishes} | ${links} | ${m.constraints} | ${m.pairs} | ${seeds} | ${m.mean} | ${m.p95} | ${m.max} | ${m.stops} | ${m.msPerIt.toFixed(4)} |`;
    const lines = [head];
    for (const n of [30, 45, 60, 87]) {
      const lib = cut(n);
      lines.push(row(measure(lib, light(lib), SEEDS60), 3, 60));
    }
    console.log(`\nSEEDED LIBRARY BY SIZE (3 links)\n${lines.join('\n')}\n`);
    const hl = heavy(full);
    console.log(`\nSEEDED LIBRARY, HEAVY LINKS\n${head}\n${row(measure(full, hl, SEEDS60), hl.length, 60)}\n`);
  });

  // Generate time at the default budget (no explicit budget passed), seeded library, 3 links, seeds 1-8.
  it('generate time at the default budget', { timeout: 10 * 60 * 1000 }, () => {
    const lib = seededLibrary();
    const { constraints } = constraintsFor(lib, seededLinks(lib));
    const rows = SEEDS.map((seed) => {
      const t = performance.now();
      const r = planWeek({ library: lib, constraints }, { seed });
      return { seed, ms: Math.round(performance.now() - t), it: r.stats.iterations, stop: r.stats.stopReason };
    });
    const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
    console.log(`\nGENERATE TIME (default budget)\n${rows.map((r) => `seed ${r.seed}: ${r.ms} ms, ${r.it} it, ${r.stop}`).join('\n')}\nmedian ${(ms[3] + ms[4]) / 2} ms, max ${ms[7]} ms\n`);
  });
});
