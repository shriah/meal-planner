// High-level entry: library + constraints -> best plan found, its score and explanations.
import { builtinConstraints } from './builtins';
import { ConstraintSchema, type Constraint } from './constraints';
import { compileModel, type CompiledModel, type Justification, type Score } from './scorer';
import { solve, type SolveOptions, type SolveResult } from './solver';
import { DAYS, MEALS, emptyPlan, slotIndex, type ComponentLike, type Day, type Meal, type PlanState } from './types';

/** The app's plan slot shape. */
export interface PlanSlotLike {
  day: Day;
  meal_slot: Meal;
  base_id: number;
  curry_id?: number;
  subzi_id?: number;
  extra_ids: number[];
}

/** Slots in day order, then meal order. Slots without a base are omitted. */
export function toPlanSlots(p: PlanState): PlanSlotLike[] {
  const out: PlanSlotLike[] = [];
  for (const day of DAYS) {
    for (const meal of MEALS) {
      const s = p[slotIndex(day, meal)];
      if (s.base === undefined) continue;
      const slot: PlanSlotLike = { day, meal_slot: meal, base_id: s.base, extra_ids: [...s.extras] };
      if (s.curry !== undefined) slot.curry_id = s.curry;
      if (s.subzi !== undefined) slot.subzi_id = s.subzi;
      out.push(slot);
    }
  }
  return out;
}

export function fromPlanSlots(slots: readonly PlanSlotLike[]): PlanState {
  const p = emptyPlan();
  for (const s of slots) {
    p[slotIndex(s.day, s.meal_slot)] = { base: s.base_id, curry: s.curry_id, subzi: s.subzi_id, extras: [...s.extra_ids] };
  }
  return p;
}

export class InvalidConstraintError extends Error {
  constructor(readonly constraintId: string, readonly issues: string[]) {
    super(`invalid constraint "${constraintId}": ${issues.join('; ')}`);
    this.name = 'InvalidConstraintError';
  }
}

export interface ModelInput {
  library: readonly ComponentLike[];
  /** Constraints compiled from stored rules. The meal-structure built-ins are added automatically. */
  constraints?: readonly Constraint[];
}

/** Validate and compile. Throws InvalidConstraintError for malformed or duplicate constraints. */
export function buildModel(input: ModelInput): CompiledModel {
  const constraints = [...builtinConstraints(), ...(input.constraints ?? [])];
  const seen = new Set<string>();
  for (const c of constraints) {
    const parsed = ConstraintSchema.safeParse(c);
    if (!parsed.success) {
      throw new InvalidConstraintError(c.id, parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
    }
    if (seen.has(c.id)) throw new InvalidConstraintError(c.id, ['duplicate constraint id']);
    seen.add(c.id);
  }
  return compileModel(input.library, constraints);
}

export interface PlanResult {
  slots: PlanSlotLike[];
  score: Score;
  /** Every hard and soft violation in the returned plan. Empty hard list = all hard rules hold. */
  justifications: Justification[];
  stats: SolveResult['stats'];
}

export function planWeek(input: ModelInput, opts: SolveOptions = {}): PlanResult {
  const r = solve(buildModel(input), opts);
  const { justifications, ...score } = r.score;
  return { slots: toPlanSlots(r.plan), score, justifications, stats: r.stats };
}
