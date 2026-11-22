// High-level entry: library + parts + constraints -> best plan found, its score and explanations.
import { builtinConstraints } from './builtins';
import { ConstraintSchema, type Constraint } from './constraints';
import { matcherFields, type Matcher } from './matcher';
import { compileModel, type CompiledModel, type Justification, type Score } from './scorer';
import { solve, type SolveOptions, type SolveResult } from './solver';
import { DAYS, MEALS, emptyPlan, slotIndex, type ComponentLike, type PartSlot, type Pins, type PlannerPart, type PlanState } from './types';

/** Meals in day order, then meal order, every part present. Meals without a first-part dish are omitted. */
export function toPartSlots(p: PlanState, parts: readonly PlannerPart[]): PartSlot[] {
  const out: PartSlot[] = [];
  for (const day of DAYS) {
    for (const meal of MEALS) {
      const s = p[slotIndex(day, meal)];
      if (!s.parts[0].length) continue;
      const byId: Record<number, number[]> = {};
      parts.forEach((part, k) => { byId[part.id] = [...s.parts[k]]; });
      out.push({ day, meal_slot: meal, parts: byId });
    }
  }
  return out;
}

/** The solver's week for `slots`; a part a slot does not name is empty. */
export function fromPartSlots(slots: readonly PartSlot[], parts: readonly PlannerPart[]): PlanState {
  const p = emptyPlan(parts.length);
  for (const s of slots) p[slotIndex(s.day, s.meal_slot)] = { parts: parts.map((part) => [...(s.parts[part.id] ?? [])]) };
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
  /** The meal's parts, in order. The first part holds exactly one dish. */
  parts: readonly PlannerPart[];
  /** Constraints compiled from stored rules. The meal-structure built-ins are added automatically. */
  constraints?: readonly Constraint[];
}

/** Every matcher of a constraint. */
const matchersOf = (c: Constraint): Matcher[] =>
  c.kind === 'pair' ? [c.when, c.of, ...(c.inMeal ?? [])] : c.kind === 'count' && c.when ? [c.select, c.when.exists] : [c.select];

/**
 * Validate and compile. Throws InvalidConstraintError for malformed or duplicate constraints, and for one that
 * still names the stored-rule field `role` (rules reach the planner rewritten to parts; one the rewrite missed
 * would silently match nothing).
 */
export function buildModel(input: ModelInput): CompiledModel {
  if (!input.parts.length) throw new Error('a meal needs at least one part');
  const constraints = [...builtinConstraints(input.parts), ...(input.constraints ?? [])];
  const seen = new Set<string>();
  for (const c of constraints) {
    const parsed = ConstraintSchema.safeParse(c);
    if (!parsed.success) {
      throw new InvalidConstraintError(c.id, parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
    }
    if (matchersOf(c).some((mt) => matcherFields(mt).has('role'))) {
      throw new InvalidConstraintError(c.id, ['the field "role" is not planned; name the part with "part"']);
    }
    if (seen.has(c.id)) throw new InvalidConstraintError(c.id, ['duplicate constraint id']);
    seen.add(c.id);
  }
  return compileModel(input.library, constraints, input.parts);
}

export interface PlanResult {
  slots: PartSlot[];
  score: Score;
  /** Every hard and soft violation in the returned plan. Empty hard list = all hard rules hold. */
  justifications: Justification[];
  stats: SolveResult['stats'];
}

export function planWeek(input: ModelInput, opts: SolveOptions & { pins?: Pins } = {}): PlanResult {
  const r = solve(buildModel(input), opts);
  const { justifications, ...score } = r.score;
  return { slots: toPartSlots(r.plan, input.parts), score, justifications, stats: r.stats };
}
