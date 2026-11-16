import type { CompiledModel } from './scorer';

export interface SearchBudget {
  maxIterations: number;
  plateauIterations: number;
}

// Constants from docs/superpowers/plans/2026-11-16-planner-search-budget-measurements.md.
export const BUDGET_BASE = 36_000;
export const BUDGET_PER_DISH = 150;
export const BUDGET_PER_PAIR = 400;
export const BUDGET_MIN = 36_000;
export const BUDGET_MAX = 200_000;
export const BUDGET_PLATEAU = 3000;

/** How many search steps a model gets: more for a bigger library and for more pair constraints. */
export function searchBudget(m: CompiledModel): SearchBudget {
  const pairs = m.constraints.filter((c) => c.kind === 'pair').length;
  const wanted = BUDGET_BASE + BUDGET_PER_DISH * m.library.length + BUDGET_PER_PAIR * pairs;
  return { maxIterations: Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, wanted)), plateauIterations: BUDGET_PLATEAU };
}
