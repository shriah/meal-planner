// Built-in constraints: the structure of a meal, expressed with the same primitives as user rules.
// Everything else the planner should prefer or avoid (one curry and one subzi per meal, extras per meal,
// which days a dish suits, variety …) is a stored rule; see `capRules` and `defaultRules` in src/rules.
import type { Constraint } from './constraints';
import { all, any, is, not } from './matcher';
import type { PlannerPart } from './types';

/**
 * The solver never creates these violations; they catch inconsistent locked slots. `parts` in meal order; `capped`
 * the parts held to one dish per meal (with the first part, the parts that hold one dish).
 */
export function builtinConstraints(parts: readonly PlannerPart[], capped: ReadonlySet<number> = new Set()): Constraint[] {
  const [first] = parts;
  // Only a part that holds many dishes can hold one twice: a one-dish part cannot, and `wrong-part` keeps a dish
  // out of every part but its own.
  const many = parts.filter((p, k) => k > 0 && !capped.has(p.id));
  return [
    { kind: 'count', id: 'builtin:one-dish-first-part', label: `Each meal needs exactly one ${first.name.toLowerCase()}`, origin: 'builtin',
      select: is('slot_part', first.id), groupBy: 'slot', bounds: { hardMin: 1, hardMax: 1 } },
    // Today's wording, which the app shows for an inconsistent stored plan.
    { kind: 'count', id: 'builtin:wrong-part', label: 'Component used in the wrong role', origin: 'builtin',
      select: any(...parts.map((p) => all(is('slot_part', p.id), not(is('part', p.id))))),
      groupBy: 'slot', bounds: { hardMax: 0 } },
    { kind: 'count', id: 'builtin:dish-twice', label: 'Same dish twice in a meal', origin: 'builtin',
      select: any(...many.map((p) => is('slot_part', p.id))), groupBy: ['component', 'slot'], bounds: { hardMax: 1 } },
  ];
}
