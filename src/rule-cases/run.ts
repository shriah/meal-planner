// Runs a case through the real rule pipeline: compileRules, then planWeek on seeds 1-8.
import { DAYS, MEALS, planWeek } from '@/planner';
import {
  compileRules, defaultRules, describeSpec, parseSpec, specReferences,
  type KnownIds, type Names, type RuleRecord,
} from '@/rules';
import { libraryOf, TEST_LIBRARY } from './library';
import type { CaseLibrary, CaseResult, CaseStatus, CaseWeeks, PlanCase } from './types';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const BUDGET = { timeLimitMs: Infinity, maxIterations: 20_000, plateauIterations: 3000 };
const CREATED = '2026-01-01T00:00:00.000Z';

export function statusOf(allPass: boolean, known?: string): CaseStatus {
  if (known) return allPass ? 'known-now-passes' : 'known';
  return allPass ? 'pass' : 'fail';
}

/** The stored form of a case's rules: ids 1..n in case order, the defaults after. */
function recordsOf(c: PlanCase, own: ReturnType<PlanCase['rules']>): RuleRecord[] {
  const all = [...own, ...(c.defaults === false ? [] : defaultRules())];
  return all.map((r, i) => ({ ...r, id: i + 1, enabled: true, created_at: CREATED }));
}

function planWeeks(c: PlanCase, lib: CaseLibrary, rules: RuleRecord[]): CaseWeeks {
  const known: KnownIds = {
    components: new Set(lib.dishes.map((d) => d.id)),
    baseCategories: new Set(lib.categories.filter((k) => k.kind === 'base').map((k) => k.id)),
    extraCategories: new Set(lib.categories.filter((k) => k.kind === 'extra').map((k) => k.id)),
  };
  const { constraints } = compileRules(rules, known);
  const results = SEEDS.map((seed) => planWeek({ library: lib.dishes, constraints }, { ...BUDGET, seed, pins: c.pins }));
  return {
    weeks: results.map((r) => r.slots),
    hard: results.map((r) => r.justifications.filter((j) => j.level === 'hard')),
    lib,
  };
}

export function runPlanCase(c: PlanCase): CaseResult {
  const lib = c.dishes?.length ? libraryOf([...TEST_LIBRARY.dishes, ...c.dishes], TEST_LIBRARY.categories) : TEST_LIBRARY;
  const own = c.rules(lib);
  const weeks = planWeeks(c, lib, recordsOf(c, own));
  let base: CaseWeeks | undefined;
  const ctx = { baseline: () => (base ??= planWeeks(c, lib, recordsOf(c, []))) };

  const expectations = c.expect.map((e) => ({ says: e.says, ...e.check(weeks, ctx) }));
  const allPass = expectations.every((e) => e.pass);

  const dishName = new Map(lib.dishes.map((d) => [d.id, d.name]));
  const catName = new Map(lib.categories.map((k) => [k.id, k.name]));
  const names: Names = {
    component: (id) => dishName.get(id),
    baseCategory: (id) => catName.get(id),
    extraCategory: (id) => catName.get(id),
  };
  const sentences: string[] = [];
  const referenced = new Set<number>();
  for (const r of own) {
    const parsed = parseSpec(r.spec);
    if (!parsed.ok) { sentences.push(r.name); continue; }
    sentences.push(describeSpec(parsed.spec, names));
    for (const id of specReferences(parsed.spec).components) referenced.add(id);
  }
  for (const d of c.dishes ?? []) referenced.add(d.id);
  const dishes = lib.dishes.filter((d) => referenced.has(d.id)).map((d) => ({ name: d.name, type: d.componentType }));

  const sampleWeek = weeks.weeks[0].map((slot) => {
    const text = [slot.base_id, slot.curry_id, slot.subzi_id, ...slot.extra_ids]
      .filter((x): x is number => x !== undefined)
      .map((id) => dishName.get(id) ?? `dish ${id}`)
      .join(', ');
    return { slot, text, highlight: c.expect.some((e) => e.highlights?.(slot) === true) };
  });
  // Day and meal order, as the grid reads.
  sampleWeek.sort((a, b) => DAYS.indexOf(a.slot.day) - DAYS.indexOf(b.slot.day) || MEALS.indexOf(a.slot.meal_slot) - MEALS.indexOf(b.slot.meal_slot));

  return {
    id: c.id, group: c.group, name: c.name, why: c.why, kind: 'plan',
    status: statusOf(allPass, c.known),
    ...(c.known && { known: c.known }),
    dishes, rules: sentences, expectations, sampleWeek,
  };
}
