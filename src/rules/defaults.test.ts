import { describe, expect, it } from 'vitest';
import { buildModel, DAYS, emptyPlan, score, slotIndex, type ComponentLike, type Day } from '@/planner';
import { defaultKeyForName, defaultRules, legacyOccasionDays } from './defaults';
import { compileRules } from './record';
import { RuleSpecSchema } from './templates';

const WEEKEND: Day[] = ['saturday', 'sunday'];
const CALENDAR = ['everyday', 'weekday', 'weekend', 'monday', 'friday', 'sunday', 'festive', 'fasting'];

/** Reference: which days the old built-in occasion constraint allowed for a dish's tags. */
function oldAllowed(tags: string[], day: Day): boolean {
  if (tags.includes('everyday')) return true;
  if (tags.includes('weekday')) return !WEEKEND.includes(day);
  if (tags.includes('weekend')) return WEEKEND.includes(day);
  const named = DAYS.filter((d) => tags.includes(d));
  return named.length === 0 || named.includes(day);
}

describe('default rules', () => {
  it('are valid stored rules', () => {
    for (const r of defaultRules()) expect(RuleSpecSchema.safeParse(r.spec).success, r.name).toBe(true);
  });

  it('each have a stable, unique key', () => {
    expect(defaultRules().map((r) => r.default_key)).toEqual([
      'extras-limit-breakfast', 'extras-limit-lunch', 'extras-limit-dinner', 'want-curry', 'want-subzi', 'variety', 'spacing',
      'extras-only-when-asked', 'prefer-frequent', 'avoid-rare',
    ]);
  });

  it('recognises a stored default by its name, whatever extras limit it carries', () => {
    for (const r of defaultRules({ breakfast: 1, lunch: 5, dinner: 4 })) expect(defaultKeyForName(r.name), r.name).toBe(r.default_key);
    expect(defaultKeyForName('Fish on Fridays')).toBeUndefined();
    expect(defaultKeyForName('Extras at brunch: at most 2')).toBeUndefined();
  });

  it('enforce the per-meal extras limit', () => {
    const mk = (id: number, componentType: ComponentLike['componentType']): ComponentLike =>
      ({ id, name: `#${id}`, componentType, dietary_tags: [], regional_tags: [], occasion_tags: [] });
    const library = [mk(1, 'base'), mk(2, 'extra'), mk(3, 'extra'), mk(4, 'extra')];
    const rules = defaultRules({ breakfast: 2, lunch: 3, dinner: 2 }).map((r, i) => ({ ...r, id: i + 1, enabled: true, created_at: '' }));
    const { constraints } = compileRules(rules, { components: new Set([1, 2, 3, 4]), baseCategories: new Set(), extraCategories: new Set() });
    const plan = emptyPlan();
    plan[slotIndex('monday', 'dinner')] = { base: 1, extras: [2, 3, 4] };
    plan[slotIndex('monday', 'lunch')] = { base: 1, extras: [2, 3, 4] };
    const hard = score(buildModel({ library, constraints }), plan, true).justifications
      .filter((j) => j.level === 'hard' && j.origin === 'rule');
    expect(hard.map((j) => [j.label, j.group.meal])).toEqual([['Extras at dinner: at most 2', 'dinner']]);
  });
});

describe('legacyOccasionDays', () => {
  it('allows exactly the days the old occasion tags allowed, for single tags and pairs', () => {
    const tagSets: string[][] = [[]];
    for (const a of CALENDAR) {
      tagSets.push([a]);
      for (const b of CALENDAR) if (a < b) tagSets.push([a, b]);
    }
    for (const tags of tagSets) {
      const days = legacyOccasionDays(tags);
      for (const day of DAYS) expect(!days || days.includes(day), `${tags.join('+')} on ${day}`).toBe(oldAllowed(tags, day));
    }
  });
});
