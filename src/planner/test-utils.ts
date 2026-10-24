// Small builders shared by planner tests.
import type { ComponentLike, Role } from './types';

let nextId = 1;

export function component(componentType: Role, overrides: Partial<ComponentLike> = {}): ComponentLike {
  const id = overrides.id ?? nextId++;
  return {
    id,
    name: `${componentType} ${id}`,
    componentType,
    dietary_tags: ['veg'],
    regional_tags: ['pan-indian'],
    occasion_tags: ['everyday'],
    ...overrides,
  };
}
