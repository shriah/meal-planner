// Runs a case through the real rule pipeline: compileRules, then planWeek on seeds 1-8.
import { DAYS, MEALS, planWeek, type Justification, type SolveOptions } from '@/planner';
import {
  capRules, compileRules, defaultRules, describeSpec, libraryNames, parseSpec, specReferences,
  type KnownIds, type Names, type RuleIssue, type RuleParts, type RuleRecord,
} from '@/rules';
import { legacyPartIds } from '@/db/parts';
import { legacySlotCaps, toLegacySlot, toWeekPartPins } from '@/services/legacy-slots';
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
  const parts = libraryFor(c).parts;
  const defaults = c.defaults === false ? [] : defaultRules(parts).filter((r) => !drop.includes(r.default_key));
  // The caps are about the converted Curry and Subzi parts: a library with its own parts has none.
  const caps = c.library ? [] : capRules(parts).filter((_, i) => !drop.includes(CAP_KEYS[i]));
  const all = [...own, ...given, ...defaults, ...caps];
  return all.map((r, i) => ({ ...r, id: i + 1, enabled: true, created_at: CREATED }));
}

export const knownIds = (lib: CaseLibrary): KnownIds => ({
  components: new Set(lib.dishes.map((d) => d.id)),
  categories: new Set(lib.categories.map((k) => k.id)),
  parts: new Set(lib.parts.map((p) => p.id)),
  categoryPart: new Map(lib.categories.flatMap((k) => (k.part_id === undefined ? [] : [[k.id, k.part_id] as const]))),
});

/** Names for describing a case's rules over its library. */
export const namesOf = (lib: CaseLibrary): Names => libraryNames(lib);

/** Whether the library's parts are the converted four, the only parts a stored rule over component types can be read against. */
const isConverted = (lib: CaseLibrary): boolean => lib.parts.every((p) => p.legacy !== undefined);

/** The library's parts as rules compile against them; a library with its own parts maps no component type to a part. */
export const rulePartsOf = (lib: CaseLibrary): RuleParts => ({ list: lib.parts, ...(isConverted(lib) && { legacy: legacyPartIds(lib.parts) }) });

/** A suppressed pairing with the part it lost named by its type: every capped part of a case library is the Curry or Subzi. */
function suppressedAs(j: Justification, s: NonNullable<Justification['suppressed']>, lib: CaseLibrary): CaseSuppressed {
  const legacy = legacyPartIds(lib.parts);
  const role = s.part === legacy.curry ? 'curry' : s.part === legacy.subzi ? 'subzi' : undefined;
  if (!role) throw new Error(`a pairing lost part ${s.part}, which is neither the Curry nor the Subzi part`);
  return { ...j, suppressed: { ...s, legacy: role } };
}

function planWeeks(c: PlanCase, lib: CaseLibrary, rules: RuleRecord[], pins: PlanCase['pins'], budget: CaseBudget = BUDGET): CaseWeeks & { issues: RuleIssue[] } {
  const { constraints, issues } = compileRules(rules, knownIds(lib), rulePartsOf(lib));
  if (c.library) {
    // A library with its own parts plans and reads weeks by part, as the planner returns them.
    if (pins && Object.keys(pins).length) throw new Error('a case with its own library cannot pin meals: pins are written in today\'s shape');
    const results = SEEDS.map((seed) => planWeek({ library: lib.dishes, parts: lib.parts, constraints }, { ...budget, seed }));
    return {
      weeks: results.map(() => []),
      parts: results.map((r) => r.slots),
      hard: results.map((r) => r.justifications.filter((j) => j.level === 'hard')),
      soft: results.map((r) => r.justifications.filter((j) => j.level === 'soft')),
      suppressed: results.map((r) => r.justifications.flatMap((j) => (j.suppressed ? [{ ...j, suppressed: j.suppressed }] : []))),
      lib,
      issues,
    };
  }
  // Pins go in and weeks come out in today's shape, as the app stores them, with the app's caps for that shape.
  const legacy = legacyPartIds(lib.parts);
  const partPins = pins && toWeekPartPins(pins, legacy);
  const model = { library: lib.dishes, parts: lib.parts, constraints: [...constraints, ...legacySlotCaps(lib.parts, legacy)] };
  const results = SEEDS.map((seed) => planWeek(model, { ...budget, seed, pins: partPins }));
  return {
    weeks: results.map((r) => r.slots.map((s) => toLegacySlot(s, legacy))),
    hard: results.map((r) => r.justifications.filter((j) => j.level === 'hard')),
    soft: results.map((r) => r.justifications.filter((j) => j.level === 'soft')),
    suppressed: results.map((r) => r.justifications.flatMap((j) => (j.suppressed ? [suppressedAs(j, j.suppressed, lib)] : []))),
    lib,
    issues,
  };
}

export const libraryFor = (c: PlanCase): CaseLibrary =>
  c.library ?? (c.dishes?.length ? libraryOf([...TEST_LIBRARY.dishes, ...c.dishes], { categories: TEST_LIBRARY.categories }) : TEST_LIBRARY);

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
  // A case may name the issues it expects (`PlanCase.issues`); any other issue, and any expected one missing, fails it.
  const issueText = (i: RuleIssue) => `${i.name}: ${i.message}`;
  const expected = c.issues ?? [];
  const unapplied = [
    ...weeks.issues.filter((i) => !expected.some((t) => issueText(i).includes(t)))
      .map((i) => ({ says: `Rule could not be applied: ${i.name}`, pass: false, got: i.message })),
    ...expected.filter((t) => !weeks.issues.some((i) => issueText(i).includes(t)))
      .map((t) => ({ says: `Rule issue expected: ${t}`, pass: false, got: weeks.issues.length ? weeks.issues.map(issueText).join('; ') : 'no rule issue' })),
  ];
  const expectations = [...unapplied, ...c.expect.map((e) => ({ says: e.says, ...e.check(weeks, ctx) }))];
  const allPass = expectations.every((e) => e.pass);

  const dishName = new Map(lib.dishes.map((d) => [d.id, d.name]));
  const names = namesOf(lib);
  const sentences: string[] = [];
  const referenced = new Set<number>();
  for (const r of [...own, ...given]) {
    const parsed = parseSpec(r.spec);
    if (!parsed.ok) { sentences.push(r.name); continue; }
    sentences.push(describeSpec(parsed.spec, names));
    for (const id of specReferences(parsed.spec).components) referenced.add(id);
  }
  for (const d of c.dishes ?? []) referenced.add(d.id);
  // A library with its own parts names each dish's part; a converted one its component type.
  const typeOf = (d: CaseLibrary['dishes'][number]) => (c.library ? lib.parts.find((p) => p.id === d.part_id)?.name ?? `part ${d.part_id}` : d.componentType);
  const dishes = lib.dishes.filter((d) => referenced.has(d.id)).map((d) => ({ name: d.name, type: typeOf(d) }));

  // The first week an expectation fails in, so the sample shows the problem; seed 1 when none can tell.
  const failIdx = c.expect.flatMap((e, i) => {
    const at = expectations[unapplied.length + i];
    return !at.pass && e.failingSeed ? [e.failingSeed(weeks, ctx)] : [];
  }).find((x): x is number => x !== undefined);
  const sampleIdx = failIdx ?? 0;

  const nameOf = (id: number) => dishName.get(id) ?? `dish ${id}`;
  const sampleWeek: NonNullable<CaseResult['sampleWeek']> = weeks.parts
    // By part, each named: "Main: Biryani · Side: Raita, Salan". Expectations highlight converted meals only.
    ? weeks.parts[sampleIdx].map((slot) => ({
      slot,
      text: lib.parts.filter((p) => (slot.parts[p.id] ?? []).length).map((p) => `${p.name}: ${slot.parts[p.id].map(nameOf).join(', ')}`).join(' · '),
      highlight: false,
    }))
    : weeks.weeks[sampleIdx].map((slot) => {
      const text = [slot.base_id, slot.curry_id, slot.subzi_id, ...slot.extra_ids]
        .filter((x): x is number => x !== undefined)
        .map(nameOf)
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
