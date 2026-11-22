// Small builders shared by planner tests.
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
