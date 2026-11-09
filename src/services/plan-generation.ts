// Pure plan generation: data in, plan and its problems out. Runs in a Web Worker or in-thread.
import {
  bringsWith, broughtScore, buildModel, candidateWeight, chooseCandidate, explain, fromPlanSlots, planWeek, score, slotIndex, slotPairs,
  MEALS, type Brings, type Justification, type Meal, type ModelInput, type Pins, type Role,
} from '@/planner';
import { compileRules, describeSpec, parseSpec, type Names, type RuleIssue, type RuleRecord } from '@/rules';
import type { CategoryRecord } from '@/types/category';
import type { ComponentRecord } from '@/types/component';
import { ALL_DAYS, type DayOfWeek, type PlanSlot, type WeeklyPlan } from '@/types/plan';
import type { SlotChange } from '@/assistant/types';

export interface PlanningInput {
  library: ComponentRecord[];
  categories: CategoryRecord[];
  rules: RuleRecord[];
}

export interface PlanningOptions {
  pins?: Pins;
  seed?: number;
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
  const { library, categories, rules } = input;
  const known = {
    components: new Set(library.map((c) => c.id)),
    baseCategories: new Set(categories.filter((c) => c.kind === 'base').map((c) => c.id)),
    extraCategories: new Set(categories.filter((c) => c.kind === 'extra').map((c) => c.id)),
  };
  const { constraints, issues } = compileRules(rules, known);
  const componentName = new Map(library.map((c) => [c.id, c.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
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
        const reason = `${sides} is not served with ${name(s.by)}: a meal holds one ${s.role}${holder}.`;
        p = { level: 'soft', reason, message: reason, ...(j.ruleId !== undefined && { ruleId: j.ruleId }), slots: [] };
        collapsed.set(key, p);
        out.push(p);
      }
      if (j.group.day && j.group.meal) p.slots.push({ day: j.group.day, meal: j.group.meal });
    }
    return out;
  };

  const model: ModelInput = { library, constraints };
  return { model, issues, problemOf, problemsOf, ruleById };
}

export function planFromData(input: PlanningInput, opts: PlanningOptions = {}): PlanningOutcome {
  const { model, issues, problemOf, problemsOf, ruleById } = modelFromData(input);
  const result = planWeek(model, { pins: opts.pins, seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31) });
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
    plan: { slots: result.slots },
    problems,
    ruleIssues: issues,
    paired: pairedSides(input, { slots: result.slots }),
  };
}

/** Every candidate of a dish's wants, unit or asked. */
const candidatesOf = (b: Brings): number[] => [...new Set(b.wants.flatMap((w) => w.of))];

/** Ids of the dishes that placing this base in a meal may bring with it (unit or asked). */
export function broughtByBase(input: PlanningInput, id: number, day: DayOfWeek, meal: Meal): number[] {
  const m = buildModel(modelFromData(input).model);
  return candidatesOf(bringsWith(m, id, 'base', slotIndex(day, meal)));
}

/** The sides in each meal that a pairing brought (the candidate present), whether a unit member or only asked for. */
export function pairedSides(input: PlanningInput, plan: WeeklyPlan): PairedSide[] {
  const m = buildModel(modelFromData(input).model);
  const state = fromPlanSlots(plan.slots);
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
  const { model, problemOf } = modelFromData(input);
  const m = buildModel(model);
  const state = fromPlanSlots(plan.slots);
  const slot = state[slotIndex(day, meal)];
  const typeOf = new Map(input.library.map((c) => [c.id, c.componentType]));
  const original = { base: slot.base, curry: slot.curry, subzi: slot.subzi, extras: slot.extras };
  const put = (id: number | undefined) => {
    if (part === 'extras') slot.extras = id === undefined ? [] : [id];
    else slot[part] = id;
  };
  const i = slotIndex(day, meal);
  // A base is planned with the sides it brings; there are no pins here, so every role is free. The sides
  // the replaced base brought leave with it, unless a dish still in the meal brings them too (as the
  // solver's `bring` does).
  const putBase = (id: number) => {
    slot.base = id;
    if (original.base !== undefined) {
      const stillBrought = (c: number) => {
        const by = (d: number | undefined, role: Role) => d !== undefined && d !== c && candidatesOf(bringsWith(m, d, role, i)).includes(c);
        return by(slot.base, 'base') || by(slot.curry, 'curry') || by(slot.subzi, 'subzi') || slot.extras.some((e) => by(e, 'extra'));
      };
      for (const side of candidatesOf(bringsWith(m, original.base, 'base', i))) {
        const type = typeOf.get(side);
        if (type === 'extra') {
          if (slot.extras.includes(side) && !stillBrought(side)) slot.extras = slot.extras.filter((e) => e !== side);
        } else if ((type === 'curry' || type === 'subzi') && slot[type] === side && !stillBrought(side)) {
          slot[type] = undefined;
        }
      }
    }
    // Each unit want with no candidate in the meal brings one of its candidates, chosen as the solver does.
    const inMeal = (c: number) => slot.base === c || slot.curry === c || slot.subzi === c || slot.extras.includes(c);
    const bringSide = (side: number) => {
      const type = typeOf.get(side);
      if (type === 'curry') slot.curry = side;
      else if (type === 'subzi') slot.subzi = side;
      else if (type === 'extra') slot.extras = [...new Set([...slot.extras, side])];
    };
    /** Brings `side` and the unit sides it brings in turn (their first candidates, into an empty role). */
    const bringWithOwn = (side: number) => {
      bringSide(side);
      const type = typeOf.get(side);
      if (type !== 'curry' && type !== 'subzi' && type !== 'extra') return;
      for (const w of bringsWith(m, side, type, i).wants) {
        const next = w.of[0];
        const role = typeOf.get(next);
        if (w.unit && !w.of.some(inMeal) && !((role === 'curry' || role === 'subzi') && slot[role] !== undefined)) bringSide(next);
      }
    };
    // A side is judged with what it brings, so its own pairings do not count against it.
    const scoreWith = (side: number) => {
      const before = { curry: slot.curry, subzi: slot.subzi, extras: slot.extras };
      bringWithOwn(side);
      const result = broughtScore(m, state, i, side);
      Object.assign(slot, before);
      return result;
    };
    for (const w of bringsWith(m, id, 'base', i).wants) {
      if (!w.unit || w.of.some(inMeal)) continue;
      bringWithOwn(chooseCandidate(w.of, i, scoreWith, timesPlanned, undefined, candidateWeight(m, i)));
    }
  };
  const timesPlanned = (id: number) =>
    state.reduce((k, s) => (s.base === id || s.curry === id || s.subzi === id || s.extras.includes(id) ? k + 1 : k), 0);
  const key = (j: Justification) => `${j.constraintId}|${JSON.stringify(j.group)}`;
  const hard = () => score(m, state, true).justifications.filter((j) => j.level === 'hard');

  put(undefined);
  const baseline = new Map(hard().map((j) => [key(j), j.units]));
  const out = new Map<number, PlanProblem[]>();
  for (const id of candidates) {
    Object.assign(slot, original);
    if (part === 'base') putBase(id);
    else put(id);
    const added = hard().filter((j) => j.units > (baseline.get(key(j)) ?? 0));
    if (added.length) out.set(id, added.map(problemOf));
  }
  if (part === 'base') Object.assign(slot, original);
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
  const { model, problemsOf } = modelFromData(input);
  const known = new Set(input.library.map((c) => c.id));
  const state = fromPlanSlots(plan.slots);
  for (const slot of state) {
    if (slot.base !== undefined && !known.has(slot.base)) slot.base = undefined;
    if (slot.curry !== undefined && !known.has(slot.curry)) slot.curry = undefined;
    if (slot.subzi !== undefined && !known.has(slot.subzi)) slot.subzi = undefined;
    slot.extras = slot.extras.filter((id) => known.has(id));
  }
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
