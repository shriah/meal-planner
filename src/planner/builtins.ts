// Built-in constraints, expressed with the same primitives as user rules.
import type { Constraint, CountConstraint } from './constraints';
import { all, any, is, not, oneOf, type Matcher } from './matcher';
import { DAYS, MEALS, ROLES, type ComponentLike, type Day, type Meal } from './types';

export interface BuiltinOptions {
  /** Maximum extras per meal. */
  extraLimits?: Partial<Record<Meal, number>>;
  /** Names for explanations. */
  baseCategoryName?: (id: number) => string | undefined;
  /** Soft cost per meal without a curry / subzi. */
  missingRoleCost?: number;
  /** Soft cost per extra placed, so extras appear only when a rule asks for them. */
  extraCost?: number;
  /** Soft cost per repeated use of the same base, curry or subzi in the week. */
  reuseCost?: number;
  /** Soft cost per extra use of the same base, curry or subzi on the same or the next day. */
  closeRepeatCost?: number;
  /** Soft reward for frequent components and cost for rare ones, per placement. */
  frequencyWeight?: { frequent: number; rare: number };
}

export const DEFAULT_EXTRA_LIMITS: Record<Meal, number> = { breakfast: 2, lunch: 3, dinner: 2 };

const WEEKDAYS: readonly Day[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

/**
 * Matches an assignment placed on a day its occasion tags do not allow:
 * - `everyday` (or no calendar tag) allows every day;
 * - `weekday` allows Monday–Friday, otherwise `weekend` allows Saturday–Sunday;
 * - otherwise named days (`monday` …) allow exactly those days.
 * Tags without a calendar meaning (`festive`, `fasting`) do not restrict days.
 */
export function occasionViolation(): Matcher {
  return any(...DAYS.map((d) => {
    const disallowedBy: Matcher[] = [];
    if (WEEKDAYS.includes(d)) disallowedBy.push(all(not(is('occasion_tags', 'weekday')), is('occasion_tags', 'weekend')));
    else disallowedBy.push(is('occasion_tags', 'weekday'));
    disallowedBy.push(all(
      not(oneOf('occasion_tags', ['weekday', 'weekend'])),
      oneOf('occasion_tags', [...DAYS]),
      not(is('occasion_tags', d)),
    ));
    return all(is('day', d), not(is('occasion_tags', 'everyday')), any(...disallowedBy));
  }));
}

/**
 * A curry with a compatibility list may only share a meal with a base whose category is on it.
 * Expanded into one slot constraint per base category in the library.
 */
export function compatConstraints(library: readonly ComponentLike[], opts: BuiltinOptions = {}): CountConstraint[] {
  const categories = [...new Set(
    library
      .filter((c) => c.componentType === 'base' && c.base_category_id != null)
      .map((c) => c.base_category_id as number),
  )].sort((a, b) => a - b);
  const restrictedCurry = all(is('role', 'curry'), is('compat_restricted', true));

  const perCategory = categories.map((k): CountConstraint => ({
    kind: 'count',
    id: `builtin:compat:${k}`,
    label: `Curry must suit a ${opts.baseCategoryName?.(k) ?? `category ${k}`} base`,
    origin: 'builtin',
    select: all(restrictedCurry, not(is('compatible_base_category_ids', k))),
    groupBy: 'slot',
    when: { exists: all(is('role', 'base'), is('base_category_id', k)) },
    bounds: { hardMax: 0 },
  }));
  perCategory.push({
    kind: 'count',
    id: 'builtin:compat:uncategorised',
    label: 'Curry with a compatibility list needs a categorised base',
    origin: 'builtin',
    select: restrictedCurry,
    groupBy: 'slot',
    when: { exists: categories.length ? all(is('role', 'base'), not(oneOf('base_category_id', categories))) : is('role', 'base') },
    bounds: { hardMax: 0 },
  });
  return perCategory;
}

export function builtinConstraints(library: readonly ComponentLike[], opts: BuiltinOptions = {}): Constraint[] {
  const limits = { ...DEFAULT_EXTRA_LIMITS, ...opts.extraLimits };
  const freq = opts.frequencyWeight ?? { frequent: 1, rare: 1 };
  return [
    // Structure. The solver never creates these violations; they catch inconsistent locked slots.
    { kind: 'count', id: 'builtin:one-base', label: 'Each meal needs exactly one base', origin: 'builtin',
      select: is('role', 'base'), groupBy: 'slot', bounds: { hardMin: 1, hardMax: 1 } },
    { kind: 'count', id: 'builtin:max-curry', label: 'At most one curry per meal', origin: 'builtin',
      select: is('role', 'curry'), groupBy: 'slot', bounds: { hardMax: 1 } },
    { kind: 'count', id: 'builtin:max-subzi', label: 'At most one subzi per meal', origin: 'builtin',
      select: is('role', 'subzi'), groupBy: 'slot', bounds: { hardMax: 1 } },
    { kind: 'count', id: 'builtin:role-type', label: 'Component used in the wrong role', origin: 'builtin',
      select: any(...ROLES.map((r) => all(is('role', r), not(is('componentType', r))))),
      groupBy: 'slot', bounds: { hardMax: 0 } },
    { kind: 'count', id: 'builtin:extra-twice', label: 'Same extra twice in a meal', origin: 'builtin',
      select: is('role', 'extra'), groupBy: ['component', 'slot'], bounds: { hardMax: 1 } },

    // Domain rules.
    ...MEALS.map((meal): Constraint => ({
      kind: 'count', id: `builtin:extras-limit:${meal}`, label: `At most ${limits[meal]} extras at ${meal}`, origin: 'builtin',
      select: is('role', 'extra'), groupBy: 'slot', scope: { meals: [meal] }, bounds: { hardMax: limits[meal] },
    })),
    { kind: 'count', id: 'builtin:occasion', label: "Not allowed on this day (occasion tags)", origin: 'builtin',
      select: occasionViolation(), groupBy: 'slot', bounds: { hardMax: 0 } },
    ...compatConstraints(library, opts),

    // Preferences. Repeating a dish across the week is normal (few curries suit some bases);
    // repeating it on the same or the next day is what makes a week feel monotonous.
    { kind: 'count', id: 'builtin:want-curry', label: 'Meal without a curry', origin: 'builtin',
      select: is('role', 'curry'), groupBy: 'slot', bounds: { softMin: 1 }, costs: { min: opts.missingRoleCost ?? 5 } },
    { kind: 'count', id: 'builtin:want-subzi', label: 'Meal without a subzi', origin: 'builtin',
      select: is('role', 'subzi'), groupBy: 'slot', bounds: { softMin: 1 }, costs: { min: opts.missingRoleCost ?? 5 } },
    { kind: 'count', id: 'builtin:variety', label: 'Dish repeated in the week', origin: 'builtin',
      select: oneOf('role', ['base', 'curry', 'subzi']), groupBy: 'component',
      bounds: { softMax: 1 }, costs: { max: opts.reuseCost ?? 2 } },
    { kind: 'count', id: 'builtin:spacing', label: 'Dish repeated on the same or next day', origin: 'builtin',
      select: oneOf('role', ['base', 'curry', 'subzi']), groupBy: ['component', { days: 2 }],
      bounds: { softMax: 1 }, costs: { max: opts.closeRepeatCost ?? 3 } },
    { kind: 'prefer', id: 'builtin:extra-cost', label: 'Extra placed', origin: 'builtin',
      select: is('role', 'extra'), weight: opts.extraCost ?? 1 },
    { kind: 'prefer', id: 'builtin:frequent', label: 'Frequent dish', origin: 'builtin',
      select: is('frequency', 'frequent'), weight: -freq.frequent },
    { kind: 'prefer', id: 'builtin:rare', label: 'Rare dish', origin: 'builtin',
      select: is('frequency', 'rare'), weight: freq.rare },
  ];
}
