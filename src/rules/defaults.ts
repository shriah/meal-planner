// The rules every library starts with: how many extras each meal may hold, and the preferences that
// make a week feel planned (variety, frequent dishes over rare ones). A meal is its base alone unless a
// rule asks for a curry, subzi or extra. They are ordinary stored rules, so they can be edited,
// disabled or deleted like any other.
import { DAYS, MEALS, is, oneOf, type Day, type Meal, type PlannerPart } from '@/planner';
import type { ComponentType } from '@/types/component';
import type { RuleRecord } from './record';

export type DefaultRule = Omit<RuleRecord, 'id' | 'enabled' | 'created_at'> & { default_key: string };

/** Extras per meal when a library has never set its own limits. */
export const DEFAULT_EXTRA_LIMITS: Record<Meal, number> = { breakfast: 2, lunch: 3, dinner: 2 };

// Soft costs. Repeating a dish across the week is normal (few curries suit some bases); repeating it
// on the same or the next day is what makes a week feel monotonous. A user's own `prefer` rules cost
// more (PREFER_COST), so they win over these.
// Above the reward of `prefer-frequent` (1), so a frequent side is still left out unless a rule asks;
// below a `prefer` rule's default cost, so any rule asking for a side wins.
const SIDE_COST = 2;
const REUSE_COST = 2;
const CLOSE_REPEAT_COST = 3;

/** The id of the converted part of `type`, found by `legacy` (never by name), if the library has it. */
const legacyPart = (parts: readonly PlannerPart[], type: ComponentType): number | undefined => parts.find((p) => p.legacy === type)?.id;

/** The stock match of a default that follows the parts: the varied parts (variety, spacing) or every part after the first (sides only). */
function defaultMatch(key: string, parts: readonly PlannerPart[]) {
  if (key === 'variety' || key === 'spacing') return oneOf('part', parts.filter((p) => p.varied).map((p) => p.id));
  if (key === 'sides-only-when-asked') return oneOf('part', parts.slice(1).map((p) => p.id));
  return undefined;
}

/**
 * The default rules over `parts`, in meal order. The extras limits are about the part that was Extras, so a library
 * without it has none.
 */
export function defaultRules(parts: readonly PlannerPart[], extraLimits: Record<Meal, number> = DEFAULT_EXTRA_LIMITS): DefaultRule[] {
  const extras = legacyPart(parts, 'extra');
  return [
    ...(extras === undefined ? [] : MEALS.map((meal): DefaultRule => ({
      default_key: `extras-limit-${meal}`,
      name: `Extras at ${meal}: at most ${extraLimits[meal]}`,
      spec: { template: 'limit', params: { match: is('part', extras), per: 'meal', max: extraLimits[meal], scope: { meals: [meal] }, strength: 'must' } },
    }))),
    {
      default_key: 'variety',
      name: 'Vary dishes across the week',
      spec: { template: 'no_repeat', params: { match: defaultMatch('variety', parts)!, within: 'week', strength: 'prefer', cost: REUSE_COST } },
    },
    {
      default_key: 'spacing',
      name: 'No dish on the same or next day',
      spec: { template: 'no_repeat', params: { match: defaultMatch('spacing', parts)!, within: 2, strength: 'prefer', cost: CLOSE_REPEAT_COST } },
    },
    {
      default_key: 'sides-only-when-asked',
      name: 'Curries, subzis and extras only when a rule asks for them',
      spec: { template: 'prefer', params: { match: defaultMatch('sides-only-when-asked', parts)!, direction: 'avoid', weight: SIDE_COST } },
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
 * A meal holds one curry and one subzi: hand-written Always rules (no default key, no owner), so they never give
 * way and the user can see, edit or delete them. The planner treats a part with such a cap as holding one dish.
 * They are about the parts that were Curry and Subzi (found by `legacy`); a library without them has none.
 */
export function capRules(parts: readonly PlannerPart[]): Omit<RuleRecord, 'id' | 'enabled' | 'created_at'>[] {
  const caps = [['Curry', 'curry'], ['Subzi', 'subzi']] as const;
  return caps.flatMap(([name, type]) => {
    const part = legacyPart(parts, type);
    return part === undefined ? [] : [{
      name: `At most one ${name} per meal`,
      spec: { template: 'limit', params: { match: is('part', part), per: 'meal', max: 1, strength: 'must' } },
    }];
  });
}

/**
 * The default a stored rule was created as, recognised by its name, for rules stored before keys
 * existed. The extras limit names carry a number that users may have changed.
 */
export function defaultKeyForName(name: string): string | undefined {
  const limit = /^Extras at (breakfast|lunch|dinner): at most \d+$/.exec(name);
  if (limit) return `extras-limit-${limit[1]}`;
  // Names do not depend on the parts.
  return defaultRules([]).find((r) => r.name === name)?.default_key ?? RETIRED_DEFAULT_NAMES[name];
}

/** Defaults an older library may still hold, by their original name; v18 switches them off or replaces them. */
export const RETIRED_DEFAULT_NAMES: Record<string, string> = {
  'A curry in every meal': 'want-curry',
  'A subzi in every meal': 'want-subzi',
  'Extras only when a rule asks for them': 'extras-only-when-asked',
};

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
