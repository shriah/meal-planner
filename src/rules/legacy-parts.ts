// Rules are stored over today's component types. They reach the planner as rules about parts: every `role` and
// `componentType` leaf is rewritten to a `part` leaf. Conversion only; stored rules are not changed.
import type { Constraint, Matcher, PlannerPart } from '@/planner';
import { isLeaf, oneOf } from '@/planner';
import type { ComponentType } from '@/types/component';

/** The part id of each component type (same shape as `LegacyParts` in `src/db/parts.ts`). */
export type LegacyParts = Record<ComponentType, number>;

/** The parts a rule set is compiled against: the planner's parts in meal order, and the legacy type-to-part ids. */
export interface RuleParts {
  list: readonly PlannerPart[];
  /** The converted type-to-part ids. Absent for parts that are not the converted four: a rule that still names a component type cannot then be planned. */
  legacy?: LegacyParts;
}

/** Rewrites every `role` and `componentType` leaf (eq, neq, in) to the same op on `part`. Other leaves are unchanged. */
export function toPartMatcher(m: Matcher, legacy: LegacyParts): Matcher {
  if (isLeaf(m)) {
    if (m.field !== 'role' && m.field !== 'componentType') return m;
    const value = Array.isArray(m.value) ? m.value.map((t) => legacy[t as ComponentType]) : legacy[m.value as ComponentType];
    return { field: 'part', op: m.op, value } as Matcher;
  }
  if ('all' in m) return { all: m.all.map((x) => toPartMatcher(x, legacy)) };
  if ('any' in m) return { any: m.any.map((x) => toPartMatcher(x, legacy)) };
  return { not: toPartMatcher(m.not, legacy) };
}

/** The constraint with every matcher it holds rewritten by `toPartMatcher`. */
export function constraintOverParts(c: Constraint, legacy: LegacyParts): Constraint {
  const over = (m: Matcher) => toPartMatcher(m, legacy);
  switch (c.kind) {
    case 'count': return { ...c, select: over(c.select), ...(c.when && { when: { exists: over(c.when.exists) } }) };
    case 'prefer': return { ...c, select: over(c.select) };
    case 'pair': return { ...c, when: over(c.when), of: over(c.of), ...(c.inMeal && { inMeal: c.inMeal.map(over) }) };
  }
}

/** Part leaf over the parts that are varied (variety and spacing). */
export const variedPartsMatcher = (parts: RuleParts): Matcher => oneOf('part', parts.list.filter((p) => p.varied).map((p) => p.id));

/** Part leaf over every part after the first (sides only when asked). */
export const sidePartsMatcher = (parts: RuleParts): Matcher => oneOf('part', parts.list.slice(1).map((p) => p.id));
