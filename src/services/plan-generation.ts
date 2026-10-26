// Pure plan generation: data in, plan and its problems out. Runs in a Web Worker or in-thread.
import {
  buildModel, explain, fromPlanSlots, planWeek, score, slotIndex,
  type Justification, type Meal, type ModelInput, type Pins,
} from '@/planner';
import { compileRules, describeSpec, parseSpec, type Names, type RuleIssue, type RuleRecord } from '@/rules';
import type { CategoryRecord } from '@/types/category';
import type { ComponentRecord } from '@/types/component';
import type { DayOfWeek, WeeklyPlan } from '@/types/plan';

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
}

export interface PlanningOutcome {
  plan: WeeklyPlan;
  /** Hard problems mean a rule is broken in the returned plan; soft ones are unmet preferences. */
  problems: PlanProblem[];
  /** Rules that were not applied at all (invalid, or referring to deleted items). */
  ruleIssues: RuleIssue[];
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

  const model: ModelInput = { library, constraints };
  return { model, issues, problemOf };
}

export function planFromData(input: PlanningInput, opts: PlanningOptions = {}): PlanningOutcome {
  const { model, issues, problemOf } = modelFromData(input);
  const result = planWeek(model, { pins: opts.pins, seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31) });
  return {
    plan: { slots: result.slots },
    problems: result.justifications.map(problemOf),
    ruleIssues: issues,
  };
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
  const put = (id: number | undefined) => {
    if (part === 'extras') slot.extras = id === undefined ? [] : [id];
    else slot[part] = id;
  };
  const key = (j: Justification) => `${j.constraintId}|${JSON.stringify(j.group)}`;
  const hard = () => score(m, state, true).justifications.filter((j) => j.level === 'hard');

  put(undefined);
  const baseline = new Map(hard().map((j) => [key(j), j.units]));
  const out = new Map<number, PlanProblem[]>();
  for (const id of candidates) {
    put(id);
    const added = hard().filter((j) => j.units > (baseline.get(key(j)) ?? 0));
    if (added.length) out.set(id, added.map(problemOf));
  }
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
  const { model, problemOf } = modelFromData(input);
  const known = new Set(input.library.map((c) => c.id));
  const state = fromPlanSlots(plan.slots);
  for (const slot of state) {
    if (slot.base !== undefined && !known.has(slot.base)) slot.base = undefined;
    if (slot.curry !== undefined && !known.has(slot.curry)) slot.curry = undefined;
    if (slot.subzi !== undefined && !known.has(slot.subzi)) slot.subzi = undefined;
    slot.extras = slot.extras.filter((id) => known.has(id));
  }
  return score(buildModel(model), state, true).justifications.map(problemOf);
}
