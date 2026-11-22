// Built-in constraints: the structure of a meal, expressed with the same primitives as user rules.
// Everything else the planner should prefer or avoid (one curry and one subzi per meal, extras per meal,
// which days a dish suits, variety …) is a stored rule; see `capRules` and `defaultRules` in src/rules.
import type { Constraint } from './constraints';
import { all, any, is, not } from './matcher';
import { ROLES } from './types';

/** The solver never creates these violations; they catch inconsistent locked slots. */
export function builtinConstraints(): Constraint[] {
  return [
    { kind: 'count', id: 'builtin:one-base', label: 'Each meal needs exactly one base', origin: 'builtin',
      select: is('role', 'base'), groupBy: 'slot', bounds: { hardMin: 1, hardMax: 1 } },
    { kind: 'count', id: 'builtin:role-type', label: 'Component used in the wrong role', origin: 'builtin',
      select: any(...ROLES.map((r) => all(is('role', r), not(is('componentType', r))))),
      groupBy: 'slot', bounds: { hardMax: 0 } },
    { kind: 'count', id: 'builtin:extra-twice', label: 'Same extra twice in a meal', origin: 'builtin',
      select: is('role', 'extra'), groupBy: ['component', 'slot'], bounds: { hardMax: 1 } },
  ];
}
