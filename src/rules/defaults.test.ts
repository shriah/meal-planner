import { describe, expect, it } from 'vitest';
import { buildModel, DAYS, emptyPlan, is, oneOf, score, slotIndex, type ComponentLike, type Day, type PlannerPart } from '@/planner';
import { capRules, defaultKeyForName, defaultRules, legacyOccasionDays } from './defaults';
import { compileRules } from './record';
import { RuleSpecSchema } from './templates';
import { TEST_RULE_PARTS } from './test-parts';

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

const PARTS = TEST_RULE_PARTS.list;

describe('default rules', () => {
  it('are valid stored rules', () => {
    for (const r of defaultRules(PARTS)) expect(RuleSpecSchema.safeParse(r.spec).success, r.name).toBe(true);
  });

  it('each have a stable, unique key', () => {
    expect(defaultRules(PARTS).map((r) => r.default_key)).toEqual([
      'extras-limit-breakfast', 'extras-limit-lunch', 'extras-limit-dinner', 'variety', 'spacing',
      'sides-only-when-asked', 'prefer-frequent', 'avoid-rare',
    ]);
  });

  it('recognises a stored default by its name, whatever extras limit it carries', () => {
    for (const r of defaultRules(PARTS, { breakfast: 1, lunch: 5, dinner: 4 })) expect(defaultKeyForName(r.name), r.name).toBe(r.default_key);
    expect(defaultKeyForName('Fish on Fridays')).toBeUndefined();
    expect(defaultKeyForName('Extras at brunch: at most 2')).toBeUndefined();
  });

  it('enforce the per-meal extras limit', () => {
    const mk = (id: number, componentType: ComponentLike['componentType']): ComponentLike =>
      ({ id, name: `#${id}`, componentType, part_id: TEST_RULE_PARTS.legacy[componentType], dietary_tags: [], regional_tags: [], occasion_tags: [] });
    const library = [mk(1, 'base'), mk(2, 'extra'), mk(3, 'extra'), mk(4, 'extra')];
    const rules = defaultRules(PARTS, { breakfast: 2, lunch: 3, dinner: 2 }).map((r, i) => ({ ...r, id: i + 1, enabled: true, created_at: '' }));
    const { constraints } = compileRules(rules, { components: new Set([1, 2, 3, 4]), categories: new Set(), parts: new Set([1, 2, 3, 4]) }, TEST_RULE_PARTS);
    // The parts in meal order: base 1 and extras 2, 3 and 4.
    const plan = emptyPlan(TEST_RULE_PARTS.list.length);
    plan[slotIndex('monday', 'dinner')] = { parts: [[1], [], [], [2, 3, 4]] };
    plan[slotIndex('monday', 'lunch')] = { parts: [[1], [], [], [2, 3, 4]] };
    const hard = score(buildModel({ library, parts: TEST_RULE_PARTS.list, constraints }), plan, true).justifications
      .filter((j) => j.level === 'hard' && j.origin === 'rule');
    expect(hard.map((j) => [j.label, j.group.meal])).toEqual([['Extras at dinner: at most 2', 'dinner']]);
  });
});

describe('default rules over parts', () => {
  const MAINS: PlannerPart[] = [
    { id: 9, name: 'Mains', varied: true, legacy: 'base' },
    { id: 5, name: 'Gravy', varied: true, legacy: 'curry' },
    { id: 7, name: 'Dry', varied: false, legacy: 'subzi' },
    { id: 6, name: 'Sides', varied: false, legacy: 'extra' },
  ];
  const spec = (parts: PlannerPart[], key: string) => defaultRules(parts).find((r) => r.default_key === key)?.spec;

  it('vary and space the varied parts, and keep sides out of every part after the first', () => {
    expect(spec(MAINS, 'variety')).toEqual({ template: 'no_repeat', params: { match: oneOf('part', [9, 5]), within: 'week', strength: 'prefer', cost: 2 } });
    expect(spec(MAINS, 'spacing')).toEqual({ template: 'no_repeat', params: { match: oneOf('part', [9, 5]), within: 2, strength: 'prefer', cost: 3 } });
    expect(spec(MAINS, 'sides-only-when-asked')).toMatchObject({ params: { match: oneOf('part', [5, 7, 6]) } });
  });

  it('limit the extras in the part that was Extras, whatever its name', () => {
    expect(spec(MAINS, 'extras-limit-lunch')).toMatchObject({ params: { match: is('part', 6), per: 'meal', max: 3 } });
    expect(capRules(MAINS).map((r) => [r.name, r.spec])).toEqual([
      ['At most one Curry per meal', { template: 'limit', params: { match: is('part', 5), per: 'meal', max: 1, strength: 'must' } }],
      ['At most one Subzi per meal', { template: 'limit', params: { match: is('part', 7), per: 'meal', max: 1, strength: 'must' } }],
    ]);
  });

  it('leave out the extras limits and caps on parts that were never converted', () => {
    const own: PlannerPart[] = [{ id: 7, name: 'Main', varied: true }, { id: 3, name: 'Side', varied: true }, { id: 5, name: 'Dessert', varied: false }];
    expect(defaultRules(own).map((r) => r.default_key)).toEqual(['variety', 'spacing', 'sides-only-when-asked', 'prefer-frequent', 'avoid-rare']);
    expect(spec(own, 'variety')).toMatchObject({ params: { match: oneOf('part', [7, 3]) } });
    expect(spec(own, 'sides-only-when-asked')).toMatchObject({ params: { match: oneOf('part', [3, 5]) } });
    expect(capRules(own)).toEqual([]);
  });

  it('name no component type', () => {
    expect(JSON.stringify([...defaultRules(PARTS), ...capRules(PARTS)])).not.toMatch(/componentType|"role"/);
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
