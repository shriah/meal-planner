// Rules stored before rules named parts hold today's component types. They reach the planner as rules about parts:
// every `role` and `componentType` leaf is rewritten to a `part` leaf. Conversion only; stored rules are not changed.
import type { Constraint, Matcher, PlannerPart } from '@/planner';
import { isLeaf } from '@/planner';
import type { ComponentType } from '@/types/component';
import type { Names } from './describe';

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

interface Named { id: number; name: string }

/**
 * Names for describing rules over a library: dishes, categories and parts by id, with the parts in meal order. The
 * categories of the curry types read before the noun ("lentil curries"), as `curry_category` did.
 */
export function libraryNames(lib: { dishes: readonly Named[]; categories: readonly (Named & { kind?: string; part_id?: number })[]; parts: readonly Named[] }): Names {
  const dish = new Map(lib.dishes.map((d) => [d.id, d.name]));
  const category = new Map(lib.categories.map((c) => [c.id, c.name]));
  const categoryPart = new Map(lib.categories.flatMap((c) => (c.part_id === undefined ? [] : [[c.id, c.part_id] as const])));
  const part = new Map(lib.parts.map((p) => [p.id, p.name]));
  const types = new Set(lib.categories.filter((c) => c.kind === 'curry').map((c) => c.id));
  return {
    component: (id) => dish.get(id),
    baseCategory: (id) => category.get(id),
    extraCategory: (id) => category.get(id),
    part: (id) => part.get(id),
    category: (id) => category.get(id),
    categoryPart: (id) => categoryPart.get(id),
    categoryIsType: (id) => types.has(id),
    ...(lib.parts.length > 0 && { firstPart: lib.parts[0].id }),
  };
}
