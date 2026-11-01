// The dishes a base brings with it: curries, subzis and extras that are "served with" it (a link the dish
// owns). Used when a base is picked by hand on the plan, so the meal fills the way the planner would fill it.
import type { Day, Meal } from '@/planner';
import type { ComponentRecord } from '@/types/component';
import { LINK_STRENGTHS, readLink } from './owned';
import type { RuleRecord } from './record';

export interface Served { curry?: number; subzi?: number; extras: number[] }

/** For each role, the dish most firmly served with `base` at this day and meal; extras all come along. */
export function servedWith(
  base: Pick<ComponentRecord, 'id' | 'base_category_id'>,
  where: { day: Day; meal: Meal },
  library: readonly ComponentRecord[],
  rules: readonly RuleRecord[],
): Served {
  const byId = new Map(library.map((c) => [c.id, c]));
  const found: { dish: ComponentRecord; rank: number }[] = [];
  for (const rule of rules) {
    if (!rule.enabled || rule.owner_component_id === undefined) continue;
    const link = readLink(rule);
    if (link?.mode !== 'serve') continue;
    const hit = link.target === 'base_dish' ? link.values.includes(base.id) : link.values.includes(base.base_category_id ?? -1);
    const inScope = (!link.scope?.days || link.scope.days.includes(where.day)) && (!link.scope?.meals || link.scope.meals.includes(where.meal));
    const dish = byId.get(rule.owner_component_id);
    if (hit && inScope && dish) found.push({ dish, rank: LINK_STRENGTHS.indexOf(link.strength) });
  }
  found.sort((a, b) => a.rank - b.rank);
  const first = (type: 'curry' | 'subzi') => found.find((f) => f.dish.componentType === type)?.dish.id;
  return {
    curry: first('curry'),
    subzi: first('subzi'),
    extras: [...new Set(found.filter((f) => f.dish.componentType === 'extra').map((f) => f.dish.id))],
  };
}
