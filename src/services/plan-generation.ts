// Pure plan generation: data in, plan and its problems out. Runs in a Web Worker or in-thread.
import {
  bringsWith, broughtScore, buildModel, compareBrought, candidateWeight, chooseCandidate, explain, fromPartSlots, mealBrings, partPosition, planWeek, score, slotIndex, slotPairs,
  MEALS, type Brings, type Justification, type Meal, type ModelInput, type PlanState,
} from '@/planner';
import { compileRules, describeSpec, parseSpec, type Names, type RuleIssue, type RuleRecord } from '@/rules';
import type { CategoryRecord } from '@/types/category';
import type { ComponentRecord } from '@/types/component';
import type { PartRecord } from '@/types/part';
import { legacyPartIds, withPart } from '@/db/parts';
import { fromLegacySlot, toLegacySlot, toWeekPartPins } from './legacy-slots';
import type { LegacyPins } from './pins';
import { ALL_DAYS, type DayOfWeek, type PlanSlot, type WeeklyPlan } from '@/types/plan';
import type { SlotChange } from '@/assistant/types';

export interface PlanningInput {
  library: ComponentRecord[];
  categories: CategoryRecord[];
  rules: RuleRecord[];
  /** The library's parts, in meal order. */
  parts: PartRecord[];
}

export interface PlanningOptions {
  pins?: LegacyPins;
  seed?: number;
  /** Safety cap on the search, in ms. For tests; the default is the planner's own cap. */
  timeLimitMs?: number;
}

/** A rule the plan could not satisfy, located where possible. */
export interface PlanProblem {
  level: 'hard' | 'soft';
  /** What is broken, in words and without where: the rule's description, or a built-in's label. */
  reason: string;
  /** The reason with where it is broken, for lists that do not show the meal. */
  message: string;
  ruleId?: number;
  day?: DayOfWeek;
  meal?: Meal;
  /** For a problem reported once for several meals: the meals it bears on. */
  slots?: { day: DayOfWeek; meal: Meal }[];
}

/** A side present in its meal because a pairing on `by` brings it. */
export interface PairedSide { day: DayOfWeek; meal: Meal; component: number; by: number; ruleId?: number }

export interface PlanningOutcome {
  plan: WeeklyPlan;
  /** Hard problems mean a rule is broken in the returned plan; soft ones are unmet preferences. */
  problems: PlanProblem[];
  /** Rules that were not applied at all (invalid, or referring to deleted items). */
  ruleIssues: RuleIssue[];
  /** Sides in the plan that a pairing brought, unit or asked. */
  paired: PairedSide[];
  /** The safety cap on search time cut the search short, so the plan is the best found by then. */
  stoppedEarly: boolean;
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Monday lunch", "Monday", "Monday–Wednesday", or "this week". */
function whereText(g: Justification['group']): string {
  if (g.day && g.meal) return `${titleCase(g.day)} ${g.meal}`;
  if (g.day) return titleCase(g.day);
  if (g.window) return `${titleCase(g.window[0])}–${titleCase(g.window[1])}`;
  if (g.meal) return `${g.meal} this week`;
  return 'this week';
}

/** Planner input for the stored data, the rules that were skipped, and a way to word each problem. */
function modelFromData(input: PlanningInput) {
  const { categories, rules, parts } = input;
  const legacy = legacyPartIds(parts);
  // A dish saved by a path that gave it no part is placed by its type.
  const library = input.library.map((c) => withPart(c, legacy));
  const known = {
    components: new Set(library.map((c) => c.id)),
    baseCategories: new Set(categories.filter((c) => c.kind === 'base').map((c) => c.id)),
    extraCategories: new Set(categories.filter((c) => c.kind === 'extra').map((c) => c.id)),
  };
  const { constraints, issues } = compileRules(rules, known, { list: parts, legacy });
  const componentName = new Map(library.map((c) => [c.id, c.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const partName = new Map(parts.map((p) => [p.id, p.name.toLowerCase()]));
  const names: Names = {
    component: (id) => componentName.get(id),
    baseCategory: (id) => categoryName.get(id),
    extraCategory: (id) => categoryName.get(id),
  };
  const ruleById = new Map(rules.map((r) => [r.id, r]));

  /** Rule problems read as the rule's description; anything else keeps the planner's own wording. */
  const problemOf = (j: Justification): PlanProblem => {
    const parsed = j.ruleId !== undefined && ruleById.has(j.ruleId) ? parseSpec(ruleById.get(j.ruleId)!.spec) : undefined;
    const reason = parsed?.ok ? describeSpec(parsed.spec, names) : undefined;
    return {
      level: j.level,
      reason: reason ?? j.label,
      message: reason ? `${reason} — ${whereText(j.group)}` : explain(j, names),
      ...(j.ruleId !== undefined && { ruleId: j.ruleId }),
      ...(j.group.day && { day: j.group.day }),
      ...(j.group.meal && { meal: j.group.meal }),
    };
  };

  /**
   * Every problem, with the pairings a stored conflict leaves unenforced (two Always curries for one
   * base) collapsed into one soft problem per pairing and base, worded as the conflict and listing its meals.
   */
  const problemsOf = (justifications: readonly Justification[], each: (j: Justification) => PlanProblem = problemOf): PlanProblem[] => {
    const out: PlanProblem[] = [];
    const collapsed = new Map<string, PlanProblem & { slots: { day: DayOfWeek; meal: Meal }[] }>();
    const name = (id: number) => componentName.get(id) ?? `dish ${id}`;
    for (const j of justifications) {
      const s = j.suppressed;
      if (!s) {
        out.push(each(j));
        continue;
      }
      const key = `${j.constraintId}|${s.by}|${s.heldBy ?? ''}|${s.heldWith ?? ''}`;
      let p = collapsed.get(key);
      if (!p) {
        const servedWith = s.heldWith === undefined || s.heldWith === s.by ? 'it' : name(s.heldWith);
        const holder = s.heldBy !== undefined && s.heldMust ? ` and ${name(s.heldBy)} is always served with ${servedWith}` : '';
        const sides = (j.candidates ?? [j.group.componentId!]).map(name).join(' or ');
        const reason = `${sides} is not served with ${name(s.by)}: a meal holds one ${partName.get(s.part) ?? 'dish in that part'}${holder}.`;
        p = { level: 'soft', reason, message: reason, ...(j.ruleId !== undefined && { ruleId: j.ruleId }), slots: [] };
        collapsed.set(key, p);
        out.push(p);
      }
      if (j.group.day && j.group.meal) p.slots.push({ day: j.group.day, meal: j.group.meal });
    }
    return out;
  };

  const model: ModelInput = { library, parts, constraints };
  /** A stored plan as the planner's week. */
  const stateOf = (plan: WeeklyPlan): PlanState => fromPartSlots(plan.slots.map((s) => fromLegacySlot(s, legacy)), parts);
  return { model, legacy, stateOf, issues, problemOf, problemsOf, ruleById };
}

export function planFromData(input: PlanningInput, opts: PlanningOptions = {}): PlanningOutcome {
  const { model, legacy, issues, problemOf, problemsOf, ruleById } = modelFromData(input);
  const result = planWeek(model, {
    pins: opts.pins && toWeekPartPins(opts.pins, legacy),
    seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
    timeLimitMs: opts.timeLimitMs,
  });
  const slots = result.slots.map((s) => toLegacySlot(s, legacy));
  const typeOf = new Map(input.library.map((c) => [c.id, c.componentType]));
  /** Whether the caller fixed (or held empty) the role the paired dish would fill in this meal. */
  const pinnedRole = (j: Justification): boolean => {
    const { day, meal, componentId } = j.group;
    if (!day || !meal || componentId === undefined || j.ruleId === undefined) return false;
    const template = ruleById.get(j.ruleId)?.spec.template;
    if (template !== 'require_with' && template !== 'comes_with') return false;
    const pin = opts.pins?.[`${day}-${meal}`];
    switch (typeOf.get(componentId)) {
      case 'curry': return pin?.curry_id !== undefined;
      case 'subzi': return pin?.subzi_id !== undefined;
      case 'extra': return pin?.extra_ids !== undefined;
      default: return false;
    }
  };
  const problems = problemsOf(result.justifications, (j) => {
    const p = problemOf(j);
    return j.level === 'hard' && pinnedRole(j) ? { ...p, message: `${p.message} — replaced by your pick` } : p;
  });
  return {
    plan: { slots },
    problems,
    ruleIssues: issues,
    paired: pairedSides(input, { slots }),
    stoppedEarly: result.stats.stopReason === 'time',
  };
}

/** Every candidate of a dish's wants, unit or asked. */
const candidatesOf = (b: Brings): number[] => [...new Set(b.wants.flatMap((w) => w.of))];

/** Ids of the dishes that placing this base in a meal may bring with it (unit or asked). */
export function broughtByBase(input: PlanningInput, id: number, day: DayOfWeek, meal: Meal): number[] {
  const { model, legacy } = modelFromData(input);
  return candidatesOf(bringsWith(buildModel(model), id, legacy.base, slotIndex(day, meal)));
}

/** The sides in each meal that a pairing brought (the candidate present), whether a unit member or only asked for. */
export function pairedSides(input: PlanningInput, plan: WeeklyPlan): PairedSide[] {
  const { model, stateOf } = modelFromData(input);
  const m = buildModel(model);
  const state = stateOf(plan);
  const out: PairedSide[] = [];
  for (const day of ALL_DAYS) {
    for (const meal of MEALS) {
      const i = slotIndex(day, meal);
      const seen = new Set<string>();
      for (const p of slotPairs(m, state, i)) {
        if (p.suppressed || p.component === undefined) continue;
        const k = `${p.component}|${p.by}|${p.ruleId ?? ''}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ day, meal, component: p.component, by: p.by, ...(p.ruleId !== undefined && { ruleId: p.ruleId }) });
      }
    }
  }
  return out;
}

export type SlotPart = 'base' | 'curry' | 'subzi' | 'extras';

/**
 * Hard problems that putting each candidate into one part of one slot would add to the plan, keyed
 * by component id; candidates that break nothing are left out. Problems the plan already has
 * without that part filled are not counted against any candidate.
 */
export function slotConflicts(
  input: PlanningInput,
  plan: WeeklyPlan,
  day: DayOfWeek,
  meal: Meal,
  part: SlotPart,
  candidates: readonly number[],
): Map<number, PlanProblem[]> {
  const { model, legacy, stateOf, problemOf } = modelFromData(input);
  const m = buildModel(model);
  const state = stateOf(plan);
  const i = slotIndex(day, meal);
  const slot = state[i];
  /** Position of each dish's own part, or -1. */
  const ownPart = (c: number) => partPosition(m, m.byId.get(c)?.part_id);
  const k = partPosition(m, legacy[part === 'extras' ? 'extra' : part]);
  const original = slot.parts.slice();
  /** Puts the meal's parts back as `to` holds them (a part's array is never changed in place). */
  const reset = (to: readonly number[][]) => { for (let j = 0; j < to.length; j++) slot.parts[j] = to[j]; };
  const put = (id: number | undefined) => { slot.parts[k] = id === undefined ? [] : [id]; };
  const inMeal = (c: number) => slot.parts.some((d) => d.includes(c));
  const hasConditional = m.constraints.some((c) => c.kind === 'pair' && !!c.inMeal?.length);
  // A base is planned with the sides it brings; there are no pins here, so every part is free. The sides
  // the replaced base brought leave with it, unless a dish still in the meal brings them too (as the
  // solver's `bring` does).
  const putBase = (id: number) => {
    slot.parts[0] = [id];
    const was = original[0][0];
    if (was !== undefined) {
      const stillBrought = (c: number) =>
        slot.parts.some((d, j) => d.some((x) => x !== c && candidatesOf(mealBrings(m, slot, i, x, m.parts[j].id)).includes(c)));
      for (const side of candidatesOf(mealBrings(m, { parts: original }, i, was, m.parts[0].id))) {
        const j = ownPart(side);
        if (j > 0 && slot.parts[j].includes(side) && !stillBrought(side)) slot.parts[j] = slot.parts[j].filter((e) => e !== side);
      }
    }
    // Each unit want with no candidate in the meal brings one of its candidates, chosen as the solver does.
    const bringSide = (side: number) => {
      const j = ownPart(side);
      if (j <= 0) return;
      slot.parts[j] = m.single[j] ? [side] : [...new Set([...slot.parts[j], side])];
    };
    /** Brings `side` and the unit sides it brings in turn (their first candidates, into an empty one-dish part). */
    const bringWithOwn = (side: number) => {
      bringSide(side);
      const j = ownPart(side);
      if (j <= 0) return;
      for (const w of mealBrings(m, slot, i, side, m.parts[j].id).wants) {
        const next = w.of[0];
        const nj = ownPart(next);
        if (w.unit && !w.of.some(inMeal) && !(nj > 0 && m.single[nj] && slot.parts[nj].length > 0)) bringSide(next);
      }
    };
    // A side is judged with what it brings, so its own pairings do not count against it; a plain link's
    // pick is judged blind to what a link waiting for a curry or subzi brings, as the solver does.
    const scoreWith = (blind: boolean) => (side: number) => {
      const before = slot.parts.slice();
      bringWithOwn(side);
      const result = broughtScore(m, state, i, side, blind);
      reset(before);
      return result;
    };
    // As the solver's `bring`: a side a link waiting for a curry or subzi brings comes only where it adds
    // no hard problem, and is otherwise left out (its missing pair is a soft problem).
    const addsNoHard = (side: number) => {
      const before = slot.parts.slice();
      const was = score(m, state).hard;
      bringSide(side);
      const after = score(m, state).hard;
      reset(before);
      return after <= was;
    };
    for (const w of mealBrings(m, slot, i, id, m.parts[0].id).wants) {
      if (!w.unit || w.of.some(inMeal)) continue;
      const options = w.cond ? w.of.filter(addsNoHard) : w.of;
      if (!options.length) continue;
      bringWithOwn(chooseCandidate(options, i, scoreWith(hasConditional && !w.cond), timesPlanned, undefined, candidateWeight(m, i), undefined, compareBrought));
    }
  };
  const timesPlanned = (id: number) => state.reduce((n, s) => (s.parts.some((d) => d.includes(id)) ? n + 1 : n), 0);
  const key = (j: Justification) => `${j.constraintId}|${JSON.stringify(j.group)}`;
  const hard = () => score(m, state, true).justifications.filter((j) => j.level === 'hard');

  put(undefined);
  const baseline = new Map(hard().map((j) => [key(j), j.units]));
  const out = new Map<number, PlanProblem[]>();
  for (const id of candidates) {
    reset(original);
    if (part === 'base') putBase(id);
    else put(id);
    const added = hard().filter((j) => j.units > (baseline.get(key(j)) ?? 0));
    if (added.length) out.set(id, added.map(problemOf));
  }
  if (part === 'base') reset(original);
  return out;
}

/** Ids the plan uses that are no longer in the library, sorted. */
export function missingDishIds(input: PlanningInput, plan: WeeklyPlan): number[] {
  const known = new Set(input.library.map((c) => c.id));
  const used = plan.slots.flatMap((s) => [s.base_id, s.curry_id, s.subzi_id, ...s.extra_ids]);
  return [...new Set(used.filter((id): id is number => id !== undefined && !known.has(id)))].sort((a, b) => a - b);
}

/**
 * Re-scores a stored plan under the rules as they are now (not as they were when it was made).
 * Dishes that have since been deleted are left out of the check rather than failing it.
 */
export function explainPlan(input: PlanningInput, plan: WeeklyPlan): PlanProblem[] {
  const { model, stateOf, problemsOf } = modelFromData(input);
  const known = new Set(input.library.map((c) => c.id));
  const state = stateOf(plan);
  for (const slot of state) slot.parts = slot.parts.map((d) => d.filter((id) => known.has(id)));
  return problemsOf(score(buildModel(model), state, true).justifications);
}

const slotIds = (s: PlanSlot | undefined): number[] =>
  s ? [s.base_id, s.curry_id, s.subzi_id, ...s.extra_ids].filter((id): id is number => id !== undefined) : [];

/**
 * Slots whose dishes differ between two plans, in day-then-meal order, with the dishes named.
 * `touches` says whether a dish is one a rule is about; a change is touched when any dish in
 * either version of the slot is.
 */
export function diffPlans(
  before: WeeklyPlan,
  after: WeeklyPlan,
  names: ReadonlyMap<number, string>,
  touches: (id: number) => boolean = () => false,
): SlotChange[] {
  const find = (p: WeeklyPlan, day: DayOfWeek, meal: Meal) => p.slots.find((s) => s.day === day && s.meal_slot === meal);
  const text = (ids: number[]) => (ids.length ? ids.map((id) => names.get(id) ?? `dish ${id}`).join(' + ') : 'nothing');
  const out: SlotChange[] = [];
  for (const day of ALL_DAYS) {
    for (const meal of MEALS) {
      const b = slotIds(find(before, day, meal));
      const a = slotIds(find(after, day, meal));
      if (b.join(',') === a.join(',')) continue;
      out.push({ day, meal, before: text(b), after: text(a), touchedByRule: [...b, ...a].some(touches) });
    }
  }
  return out;
}
