// Runs a case through the real rule pipeline: compileRules, then planWeek on seeds 1-8.
import { DAYS, MEALS, planWeek, type Justification, type SolveOptions } from '@/planner';
import {
  capRules, compileRules, defaultRules, describeSpec, parseSpec, specReferences,
  type KnownIds, type Names, type RuleIssue, type RuleParts, type RuleRecord,
} from '@/rules';
import { legacyPartIds } from '@/db/parts';
import { libraryOf, TEST_LIBRARY } from './library';
import type { CaseLibrary, CaseResult, CaseRule, CaseStatus, CaseSuppressed, CaseWeeks, PlanCase } from './types';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
export type CaseBudget = Pick<SolveOptions, 'maxIterations' | 'plateauIterations' | 'timeLimitMs'>;
// Iterations come from `searchBudget` for each case's model; time never ends a case's search.
const BUDGET: CaseBudget = { timeLimitMs: Infinity };
const CREATED = '2026-01-01T00:00:00.000Z';

export function statusOf(allPass: boolean, known?: string): CaseStatus {
  if (known) return allPass ? 'known-now-passes' : 'known';
  return allPass ? 'pass' : 'fail';
}

/** How `PlanCase.without` names each of `capRules()`, in order. */
const CAP_KEYS = ['cap:curry', 'cap:subzi'] as const;

/**
 * The stored form of a case's rules: ids 1..n in case order (its own, then the given ones), the defaults after,
 * then the curry and subzi caps (kept by a `defaults: false` case too, as every library has them), less any
 * default or cap named in `drop`.
 */
export function recordsOf(c: PlanCase, own: CaseRule[], given: CaseRule[] = [], drop: readonly string[] = []): RuleRecord[] {
  const defaults = c.defaults === false ? [] : defaultRules().filter((r) => !drop.includes(r.default_key));
  const caps = capRules().filter((_, i) => !drop.includes(CAP_KEYS[i]));
  const all = [...own, ...given, ...defaults, ...caps];
  return all.map((r, i) => ({ ...r, id: i + 1, enabled: true, created_at: CREATED }));
}

export const knownIds = (lib: CaseLibrary): KnownIds => ({
  components: new Set(lib.dishes.map((d) => d.id)),
  baseCategories: new Set(lib.categories.filter((k) => k.kind === 'base').map((k) => k.id)),
  extraCategories: new Set(lib.categories.filter((k) => k.kind === 'extra').map((k) => k.id)),
});

/** The library's parts as rules compile against them. */
export const rulePartsOf = (lib: CaseLibrary): RuleParts => ({ list: lib.parts, legacy: legacyPartIds(lib.parts) });

/** A suppressed pairing with the part it lost named by its type: every capped part of a case library is the Curry or Subzi. */
function suppressedAs(j: Justification, s: NonNullable<Justification['suppressed']>, lib: CaseLibrary): CaseSuppressed {
  const legacy = legacyPartIds(lib.parts);
  const role = s.part === legacy.curry ? 'curry' : s.part === legacy.subzi ? 'subzi' : undefined;
  if (!role) throw new Error(`a pairing lost part ${s.part}, which is neither the Curry nor the Subzi part`);
  const suppressed: CaseSuppressed['suppressed'] & { part?: number } = { ...s, role };
  delete suppressed.part;
  return { ...j, suppressed };
}

function planWeeks(c: PlanCase, lib: CaseLibrary, rules: RuleRecord[], pins: PlanCase['pins'], budget: CaseBudget = BUDGET): CaseWeeks & { issues: RuleIssue[] } {
  const { constraints, issues } = compileRules(rules, knownIds(lib), rulePartsOf(lib));
  const results = SEEDS.map((seed) => planWeek({ library: lib.dishes, constraints }, { ...budget, seed, pins }));
  return {
    weeks: results.map((r) => r.slots),
    hard: results.map((r) => r.justifications.filter((j) => j.level === 'hard')),
    soft: results.map((r) => r.justifications.filter((j) => j.level === 'soft')),
    suppressed: results.map((r) => r.justifications.flatMap((j) => (j.suppressed ? [suppressedAs(j, j.suppressed, lib)] : []))),
    lib,
    issues,
  };
}

export const libraryFor = (c: PlanCase): CaseLibrary =>
  c.dishes?.length ? libraryOf([...TEST_LIBRARY.dishes, ...c.dishes], TEST_LIBRARY.categories) : TEST_LIBRARY;

/**
 * The case planned without what it is about (its own rules, its pins and the defaults it names), the given
 * rules and other defaults kept. A case whose expectations all still pass here proves nothing.
 */
export function failsWithoutSubject(c: PlanCase, budget: CaseBudget = BUDGET): { fails: boolean; passing: string[] } {
  const lib = libraryFor(c);
  const given = c.given?.(lib) ?? [];
  const weeks = planWeeks(c, lib, recordsOf(c, [], given, c.without), {}, budget);
  let base: CaseWeeks | undefined;
  const ctx = { baseline: () => (base ??= planWeeks(c, lib, recordsOf(c, [], given), c.pins, budget)) };
  const passing = c.expect.filter((e) => e.check(weeks, ctx).pass).map((e) => e.says);
  return { fails: passing.length < c.expect.length, passing };
}

export function runPlanCase(c: PlanCase, budget: CaseBudget = BUDGET): CaseResult {
  const lib = libraryFor(c);
  const own = c.rules(lib);
  const given = c.given?.(lib) ?? [];
  const weeks = planWeeks(c, lib, recordsOf(c, own, given), c.pins, budget);
  let base: CaseWeeks | undefined;
  const ctx = { baseline: () => (base ??= planWeeks(c, lib, recordsOf(c, [], given), c.pins, budget)) };

  // A rule that was left out of the plan would let a case pass for the wrong reason.
  const unapplied = weeks.issues.map((i) => ({ says: `Rule could not be applied: ${i.name}`, pass: false, got: i.message }));
  const expectations = [...unapplied, ...c.expect.map((e) => ({ says: e.says, ...e.check(weeks, ctx) }))];
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
  for (const r of [...own, ...given]) {
    const parsed = parseSpec(r.spec);
    if (!parsed.ok) { sentences.push(r.name); continue; }
    sentences.push(describeSpec(parsed.spec, names));
    for (const id of specReferences(parsed.spec).components) referenced.add(id);
  }
  for (const d of c.dishes ?? []) referenced.add(d.id);
  const dishes = lib.dishes.filter((d) => referenced.has(d.id)).map((d) => ({ name: d.name, type: d.componentType }));

  // The first week an expectation fails in, so the sample shows the problem; seed 1 when none can tell.
  const failIdx = c.expect.flatMap((e, i) => {
    const at = expectations[unapplied.length + i];
    return !at.pass && e.failingSeed ? [e.failingSeed(weeks, ctx)] : [];
  }).find((x): x is number => x !== undefined);
  const sampleIdx = failIdx ?? 0;

  const sampleWeek = weeks.weeks[sampleIdx].map((slot) => {
    const text = [slot.base_id, slot.curry_id, slot.subzi_id, ...slot.extra_ids]
      .filter((x): x is number => x !== undefined)
      .map((id) => dishName.get(id) ?? `dish ${id}`)
      .join(', ');
    return { slot, text, highlight: c.expect.some((e) => e.highlights?.(slot, lib) === true) };
  });
  // Day and meal order, as the grid reads.
  sampleWeek.sort((a, b) => DAYS.indexOf(a.slot.day) - DAYS.indexOf(b.slot.day) || MEALS.indexOf(a.slot.meal_slot) - MEALS.indexOf(b.slot.meal_slot));

  return {
    id: c.id, group: c.group, name: c.name, why: c.why, kind: 'plan',
    status: statusOf(allPass, c.known),
    ...(c.known && { known: c.known }),
    defaults: c.defaults !== false,
    dishes, rules: sentences, expectations, sampleSeed: SEEDS[sampleIdx], sampleWeek,
  };
}
