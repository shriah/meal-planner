// Pure plan generation: data in, plan and its problems out. Runs in a Web Worker or in-thread.
import {
  buildModel, explain, fromPlanSlots, planWeek, score, slotIndex,
  type Justification, type Meal, type ModelInput, type Pins,
} from '@/planner';
import { compileRules, type RuleIssue, type RuleRecord } from '@/rules';
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

/** Planner input for the stored data, plus the rules that were skipped and names for explanations. */
function modelFromData(input: PlanningInput) {
  const { library, categories, rules } = input;
  const known = {
    components: new Set(library.map((c) => c.id)),
    baseCategories: new Set(categories.filter((c) => c.kind === 'base').map((c) => c.id)),
    extraCategories: new Set(categories.filter((c) => c.kind === 'extra').map((c) => c.id)),
  };
  const { constraints, issues } = compileRules(rules, known);
  const componentName = new Map(library.map((c) => [c.id, c.name]));
  const model: ModelInput = { library, constraints };
  return { model, issues, names: { component: (id: number) => componentName.get(id) } };
}

export function planFromData(input: PlanningInput, opts: PlanningOptions = {}): PlanningOutcome {
  const { model, issues, names } = modelFromData(input);
  const result = planWeek(model, { pins: opts.pins, seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31) });
  return {
    plan: { slots: result.slots },
    problems: result.justifications.map((j) => toProblem(j, explain(j, names))),
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
  const { model, names } = modelFromData(input);
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
    if (added.length) out.set(id, added.map((j) => toProblem(j, explain(j, names))));
  }
  return out;
}

function toProblem(j: Justification, message: string): PlanProblem {
  return {
    level: j.level,
    message,
    ...(j.ruleId !== undefined && { ruleId: j.ruleId }),
    ...(j.group.day && { day: j.group.day }),
    ...(j.group.meal && { meal: j.group.meal }),
  };
}
