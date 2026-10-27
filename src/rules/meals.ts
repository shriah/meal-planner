// Which meals a dish may be planned at, judged from every enabled "only at certain meals" rule that applies to it.
import { MEALS, type ComponentLike, type Meal } from '@/planner';
import { previewMatches } from './form';
import { parseSpec, type RuleRecord } from './record';

/**
 * Meals a dish is not ruled out of. Only hard rules that apply on every day count: a rule limited to some
 * days, or a preference, still leaves the meal possible.
 */
export function allowedMealsOf(component: ComponentLike, rules: readonly Pick<RuleRecord, 'spec' | 'enabled'>[]): Meal[] {
  let allowed: Meal[] = [...MEALS];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const parsed = parseSpec(rule.spec);
    if (!parsed.ok || parsed.spec.template !== 'allowed_meals') continue;
    const { match, meals, days, strength } = parsed.spec.params;
    if (strength !== 'must' || days || previewMatches(match, [component]).length === 0) continue;
    allowed = allowed.filter((m) => meals.includes(m));
  }
  return allowed;
}
