// The rules every library starts with: how many extras each meal may hold, and the preferences that
// make a week feel planned (a curry and subzi in each meal, variety, frequent dishes over rare ones).
// They are ordinary stored rules, so they can be edited, disabled or deleted like any other.
import { DAYS, MEALS, is, oneOf, type Day, type Meal } from '@/planner';
import type { RuleRecord } from './record';

export type DefaultRule = Omit<RuleRecord, 'id' | 'enabled' | 'created_at'> & { default_key: string };

/** Extras per meal when a library has never set its own limits. */
export const DEFAULT_EXTRA_LIMITS: Record<Meal, number> = { breakfast: 2, lunch: 3, dinner: 2 };

// Soft costs. Repeating a dish across the week is normal (few curries suit some bases); repeating it
// on the same or the next day is what makes a week feel monotonous. A user's own `prefer` rules cost
// more (PREFER_COST), so they win over these.
const MISSING_ROLE_COST = 5;
const REUSE_COST = 2;
const CLOSE_REPEAT_COST = 3;

export function defaultRules(extraLimits: Record<Meal, number> = DEFAULT_EXTRA_LIMITS): DefaultRule[] {
  const dishes = oneOf('componentType', ['base', 'curry', 'subzi']);
  return [
    ...MEALS.map((meal): DefaultRule => ({
      default_key: `extras-limit-${meal}`,
      name: `Extras at ${meal}: at most ${extraLimits[meal]}`,
      spec: { template: 'limit', params: { match: is('componentType', 'extra'), per: 'meal', max: extraLimits[meal], scope: { meals: [meal] }, strength: 'must' } },
    })),
    {
      default_key: 'want-curry',
      name: 'A curry in every meal',
      spec: { template: 'require', params: { match: is('componentType', 'curry'), strength: 'prefer', cost: MISSING_ROLE_COST } },
    },
    {
      default_key: 'want-subzi',
      name: 'A subzi in every meal',
      spec: { template: 'require', params: { match: is('componentType', 'subzi'), strength: 'prefer', cost: MISSING_ROLE_COST } },
    },
    {
      default_key: 'variety',
      name: 'Vary dishes across the week',
      spec: { template: 'no_repeat', params: { match: dishes, within: 'week', strength: 'prefer', cost: REUSE_COST } },
    },
    {
      default_key: 'spacing',
      name: 'No dish on the same or next day',
      spec: { template: 'no_repeat', params: { match: dishes, within: 2, strength: 'prefer', cost: CLOSE_REPEAT_COST } },
    },
    {
      default_key: 'extras-only-when-asked',
      name: 'Extras only when a rule asks for them',
      spec: { template: 'prefer', params: { match: is('componentType', 'extra'), direction: 'avoid', weight: 1 } },
    },
    {
      default_key: 'prefer-frequent',
      name: 'Prefer frequent dishes',
      spec: { template: 'prefer', params: { match: is('frequency', 'frequent'), direction: 'prefer', weight: 1 } },
    },
    {
      default_key: 'avoid-rare',
      name: 'Avoid rare dishes',
      spec: { template: 'prefer', params: { match: is('frequency', 'rare'), direction: 'avoid', weight: 1 } },
    },
  ];
}

/**
 * The default a stored rule was created as, recognised by its name, for rules stored before keys
 * existed. The extras limit names carry a number that users may have changed.
 */
export function defaultKeyForName(name: string): string | undefined {
  const limit = /^Extras at (breakfast|lunch|dinner): at most \d+$/.exec(name);
  if (limit) return `extras-limit-${limit[1]}`;
  return defaultRules().find((r) => r.name === name)?.default_key;
}

const WEEKDAYS: Day[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const WEEKEND: Day[] = ['saturday', 'sunday'];

/**
 * The days a dish's old calendar occasion tags allowed, or undefined for any day:
 * `everyday` (or no calendar tag) allows every day; `weekday` allows Monday–Friday, otherwise
 * `weekend` allows Saturday–Sunday; otherwise named days (`monday` …) allow exactly those days.
 */
export function legacyOccasionDays(tags: readonly string[]): Day[] | undefined {
  if (tags.includes('everyday')) return undefined;
  if (tags.includes('weekday')) return WEEKDAYS;
  if (tags.includes('weekend')) return WEEKEND;
  const named = DAYS.filter((d) => tags.includes(d));
  return named.length ? named : undefined;
}

/** Calendar occasion tags, which are now `allowed_days` rules the dish owns. */
export const LEGACY_CALENDAR_TAGS: readonly string[] = ['everyday', 'weekday', 'weekend', ...DAYS];
