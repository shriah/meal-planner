// Upgrading a real v13 database: rules are converted to templates, unconvertible ones are listed once.
import Dexie from 'dexie';
import { afterAll, describe, expect, it } from 'vitest';
import { db, RULE_MIGRATION_NOTICE_ID } from '@/db/client';
import { RuleSpecSchema } from '@/rules';

const V13_STORES = {
  categories: '++id, kind, name',
  components: '++id, componentType, base_type, base_category_id, extra_category, extra_category_id, *compatible_base_types, *compatible_base_category_ids, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
};

const oldRule = (name: string, compiled_filter: unknown, enabled = true) =>
  ({ name, enabled, compiled_filter, created_at: '2026-01-01T00:00:00.000Z' });

describe('v14 rule migration', () => {
  afterAll(() => db.close());

  it('converts old rules by their stated meaning and records the ones it dropped', async () => {
    db.close();
    await Dexie.delete('FoodPlannerDB');

    const v13 = new Dexie('FoodPlannerDB');
    v13.version(13).stores(V13_STORES);
    await v13.open();
    const riceId = (await v13.table('categories').add({ kind: 'base', name: 'rice-based', created_at: '' })) as number;
    const liquidId = (await v13.table('categories').add({ kind: 'extra', name: 'liquid', created_at: '' })) as number;
    const pooriId = (await v13.table('components').add({ name: 'Poori', componentType: 'base', dietary_tags: ['veg'], regional_tags: [], occasion_tags: [], created_at: '' })) as number;
    await v13.table('rules').bulkAdd([
      oldRule('Rice-based: lunch only', { type: 'rule', target: { mode: 'base_category', category_id: riceId }, scope: { days: null, slots: null }, effects: [{ kind: 'allowed_slots', slots: ['lunch'] }] }),
      oldRule('Poori: breakfast only', { type: 'rule', target: { mode: 'component', component_id: pooriId }, scope: { days: null, slots: ['lunch', 'dinner'] }, effects: [{ kind: 'exclude' }] }, false),
      oldRule('Rice with rasam', { type: 'rule', target: { mode: 'base_category', category_id: riceId }, scope: { days: null, slots: null }, effects: [{ kind: 'no_repeat' }, { kind: 'require_extra', category_ids: [liquidId] }] }),
      oldRule('Deleted dish', { type: 'rule', target: { mode: 'component', component_id: 999 }, scope: { days: null, slots: null }, effects: [{ kind: 'exclude' }] }),
      oldRule('Ancient shape', { type: 'no-repeat', component_type: 'curry' }),
    ]);
    v13.close();

    await db.open();

    const rules = await db.rules.toArray();
    expect(rules.map((r) => [r.name, r.enabled, r.spec.template])).toEqual([
      ['Rice-based: lunch only', true, 'allowed_meals'],
      ['Poori: breakfast only', false, 'exclude'],
      ['Rice with rasam — No repeats', true, 'no_repeat'],
      ['Rice with rasam — Also include when', true, 'require_with'],
    ]);
    expect(rules.every((r) => RuleSpecSchema.safeParse(r.spec).success)).toBe(true);
    expect(rules[3].spec).toMatchObject({ params: { extraCategories: [liquidId] } });

    const notice = await db.notices.get(RULE_MIGRATION_NOTICE_ID);
    expect(notice).toMatchObject({ converted: 4, dismissed: false });
    expect(notice?.dropped.map((d) => [d.name, d.reason])).toEqual([
      ['Deleted dish', 'it refers to component #999, which no longer exists'],
      ['Ancient shape', 'it could not be read'],
    ]);
  });
});
