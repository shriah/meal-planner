// Pure plan generation: data in, plan and its problems out. Runs in a Web Worker or in-thread.
import { explain, planWeek, type Justification, type Meal, type Pins } from '@/planner';
import { compileRules, type RuleIssue, type RuleRecord } from '@/rules';
import type { CategoryRecord } from '@/types/category';
import type { ComponentRecord } from '@/types/component';
import type { DayOfWeek, WeeklyPlan } from '@/types/plan';

export interface PlanningInput {
  library: ComponentRecord[];
  categories: CategoryRecord[];
  rules: RuleRecord[];
  extraLimits?: Partial<Record<Meal, number>>;
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

export function planFromData(input: PlanningInput, opts: PlanningOptions = {}): PlanningOutcome {
  const { library, categories, rules } = input;
  const known = {
    components: new Set(library.map((c) => c.id)),
    baseCategories: new Set(categories.filter((c) => c.kind === 'base').map((c) => c.id)),
    extraCategories: new Set(categories.filter((c) => c.kind === 'extra').map((c) => c.id)),
  };
  const { constraints, issues } = compileRules(rules, known);

  const componentName = new Map(library.map((c) => [c.id, c.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const result = planWeek(
    {
      library,
      constraints,
      builtins: { extraLimits: input.extraLimits, baseCategoryName: (id) => categoryName.get(id) },
    },
    { pins: opts.pins, seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31) },
  );

  const names = { component: (id: number) => componentName.get(id) };
  return {
    plan: { slots: result.slots },
    problems: result.justifications.map((j) => toProblem(j, explain(j, names))),
    ruleIssues: issues,
  };
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
