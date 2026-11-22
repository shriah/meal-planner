// Small builders shared by planner tests.
import type { CountConstraint } from './constraints';
import type { ComponentLike, PlannerPart, Role } from './types';

/** The four converted parts as the planner sees them, in meal order. */
export const TEST_PARTS: readonly PlannerPart[] = [
  { id: 1, name: 'Base', varied: true },
  { id: 2, name: 'Curry', varied: true },
  { id: 3, name: 'Subzi', varied: true },
  { id: 4, name: 'Extras', varied: false },
];
const PART_OF_TYPE: Record<Role, number> = { base: 1, curry: 2, subzi: 3, extra: 4 };

let nextId = 1;

export function component(componentType: Role, overrides: Partial<ComponentLike> = {}): ComponentLike {
  const id = overrides.id ?? nextId++;
  return {
    id,
    name: `${componentType} ${id}`,
    componentType,
    part_id: PART_OF_TYPE[componentType],
    dietary_tags: ['veg'],
    regional_tags: ['pan-indian'],
    occasion_tags: [],
    ...overrides,
  };
}

/**
 * "At most one Curry per meal" and "At most one Subzi per meal" as `compileRules` gives them to the planner (the
 * stored `capRules()`): a hard cap of 1 per meal on the Curry and Subzi parts. A model built by hand includes them
 * where a library would.
 */
export function capConstraints(parts: readonly PlannerPart[] = TEST_PARTS): CountConstraint[] {
  return ['Curry', 'Subzi'].map((name) => {
    const part = parts.find((p) => p.name === name);
    if (!part) throw new Error(`no ${name} part`);
    return {
      kind: 'count', id: `cap:${name.toLowerCase()}`, label: `At most one ${name} per meal`, origin: 'rule', level: 'rule',
      select: { field: 'part', op: 'eq', value: part.id }, groupBy: 'slot', bounds: { hardMax: 1 },
    };
  });
}
