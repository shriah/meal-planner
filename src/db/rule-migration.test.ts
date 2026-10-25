// Upgrading a real v13 database: rules are converted to templates, unconvertible ones are listed once.
import Dexie from 'dexie';
import { afterAll, describe, expect, it } from 'vitest';
import { db, RULE_MIGRATION_NOTICE_ID } from '@/db/client';
import { all, is, oneOf } from '@/planner';
import { defaultRules, RuleSpecSchema } from '@/rules';

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

    // v16 also adds the default rules; this test is about the converted ones.
    const defaults = new Set(defaultRules().map((r) => r.name));
    const rules = (await db.rules.toArray()).filter((r) => !defaults.has(r.name));
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

  it('v15 and v16 turn component compatibility lists and calendar tags into rules the component owns', async () => {
    db.close();
    await Dexie.delete('FoodPlannerDB');

    const v14 = new Dexie('FoodPlannerDB');
    v14.version(14).stores({ ...V13_STORES, notices: 'id' });
    await v14.open();
    const riceId = (await v14.table('categories').add({ kind: 'base', name: 'rice-based', created_at: '' })) as number;
    const dish = (name: string, componentType: string, extra: object = {}) =>
      ({ name, componentType, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '', ...extra });
    const [sambarId, rasamId, anyId, subziId, anySubziId, papadId, pooriId, weekdayId] = (await v14.table('components').bulkAdd([
      dish('Sambar', 'curry', { compatible_base_category_ids: [riceId, 999] }),
      dish('Rasam', 'curry', { compatible_base_category_ids: [] }),
      dish('Any Curry', 'curry'),
      dish('Bhindi', 'subzi', { compatible_base_category_ids: [riceId], compatible_base_types: ['rice-based'] }),
      dish('Beans', 'subzi', { compatible_base_category_ids: [] }),
      dish('Papad', 'extra', { incompatible_curry_categories: ['soup', 'gravy'] }),
      dish('Puri', 'base', { occasion_tags: ['festive', 'sunday', 'friday'] }),
      // `weekday` used to override named days.
      dish('Upma', 'base', { occasion_tags: ['weekday', 'monday'] }),
    ], { allKeys: true })) as number[];
    v14.close();

    await db.open();

    const rules = (await db.rules.toArray()).filter((r) => r.owner_component_id !== undefined);
    expect(rules.map((r) => [r.name, r.owner_component_id, r.spec])).toEqual([
      ['Sambar: base pairing', sambarId, { template: 'pairs_with', params: { match: is('id', sambarId), baseCategories: [riceId], strength: 'must' } }],
      // An empty subzi list was never enforced, so Beans stays unrestricted.
      ['Bhindi: base pairing', subziId, { template: 'pairs_with', params: { match: is('id', subziId), baseCategories: [riceId], strength: 'must' } }],
      // Unknown curry types are dropped.
      ['Papad: not with these curries', papadId, {
        template: 'avoid_with',
        params: { match: is('id', papadId), with: all(is('componentType', 'curry'), oneOf('curry_category', ['soup'])), strength: 'must' },
      }],
      // v16: an empty curry pairing becomes "never planned automatically"; calendar tags become days.
      ['Rasam: never planned automatically', rasamId, { template: 'exclude', params: { match: is('id', rasamId), strength: 'must' } }],
      ['Puri: only on certain days', pooriId, { template: 'allowed_days', params: { match: is('id', pooriId), days: ['friday', 'sunday'], strength: 'must' } }],
      ['Upma: only on certain days', weekdayId, {
        template: 'allowed_days', params: { match: is('id', weekdayId), days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], strength: 'must' },
      }],
    ]);
    const [puri, upma] = await db.components.bulkGet([pooriId, weekdayId]);
    expect(puri?.occasion_tags).toEqual(['festive']);
    expect(upma?.occasion_tags).toEqual([]);
    expect(rules.every((r) => RuleSpecSchema.safeParse(r.spec).success)).toBe(true);
    for (const c of await db.components.bulkGet([sambarId, rasamId, anyId, subziId, anySubziId, papadId])) {
      expect(c).not.toHaveProperty('compatible_base_category_ids');
      expect(c).not.toHaveProperty('compatible_base_types');
      expect(c).not.toHaveProperty('incompatible_curry_categories');
    }
  });

  it('v16 moves preferences and default behaviour into rules, converting what an earlier v15 left behind', async () => {
    db.close();
    await Dexie.delete('FoodPlannerDB');

    const v15 = new Dexie('FoodPlannerDB');
    v15.version(15).stores({ ...V13_STORES, rules: '++id, owner_component_id', notices: 'id' });
    await v15.open();
    const dish = (name: string, componentType: string, extra: object = {}) =>
      ({ name, componentType, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '', ...extra });
    const [weekendId, mondayId, papadId, rasamId, ownedDaysId] = (await v15.table('components').bulkAdd([
      dish('Puri', 'base', { occasion_tags: ['weekend', 'festive'] }),
      // An earlier v15 left named days on dishes.
      dish('Upma', 'base', { occasion_tags: ['monday'] }),
      // An earlier v15 did not convert extras' curry clashes.
      dish('Papad', 'extra', { incompatible_curry_categories: ['soup'] }),
      dish('Rasam', 'curry'),
      dish('Poha', 'base', { occasion_tags: ['weekday'] }),
    ], { allKeys: true })) as number[];
    const owned = (id: number, name: string, spec: unknown) =>
      ({ name, enabled: true, created_at: '', owner_component_id: id, spec });
    await v15.table('rules').bulkAdd([
      owned(rasamId, 'Rasam: base pairing', { template: 'pairs_with', params: { match: is('id', rasamId), baseCategories: [], strength: 'must' } }),
      // Already owns a days rule: no second one is added.
      owned(ownedDaysId, 'Poha: specific days', { template: 'allowed_days', params: { match: is('id', ownedDaysId), days: ['monday'], strength: 'must' } }),
    ]);
    await v15.table('preferences').put({ id: 'prefs', extra_quantity_limits: { breakfast: 1, lunch: 4, dinner: 2 } });
    v15.close();

    await db.open();

    const rules = await db.rules.toArray();
    const ownedBy = (id: number) => rules.filter((r) => r.owner_component_id === id).map((r) => r.spec);
    expect(ownedBy(weekendId)).toEqual([{ template: 'allowed_days', params: { match: is('id', weekendId), days: ['saturday', 'sunday'], strength: 'must' } }]);
    expect(ownedBy(mondayId)).toEqual([{ template: 'allowed_days', params: { match: is('id', mondayId), days: ['monday'], strength: 'must' } }]);
    expect(ownedBy(papadId)).toEqual([expect.objectContaining({ template: 'avoid_with' })]);
    expect(ownedBy(rasamId)).toEqual([{ template: 'exclude', params: { match: is('id', rasamId), strength: 'must' } }]);
    expect(ownedBy(ownedDaysId)).toEqual([expect.objectContaining({ params: expect.objectContaining({ days: ['monday'] }) })]);

    // Extras limits come from the stored preferences; the other defaults are added alongside.
    const names = rules.map((r) => r.name);
    for (const r of defaultRules({ breakfast: 1, lunch: 4, dinner: 2 })) expect(names).toContain(r.name);
    expect(await db.preferences.count()).toBe(0);
    expect(rules.every((r) => RuleSpecSchema.safeParse(r.spec).success)).toBe(true);
    for (const c of await db.components.toArray()) {
      expect(c.occasion_tags, c.name).toEqual(c.name === 'Puri' ? ['festive'] : []);
      expect(c).not.toHaveProperty('incompatible_curry_categories');
    }
  });

  it('v17 gives default rules a stable key, matching by name and leaving everything else alone', async () => {
    db.close();
    await Dexie.delete('FoodPlannerDB');

    const v16 = new Dexie('FoodPlannerDB');
    v16.version(16).stores({ ...V13_STORES, rules: '++id, owner_component_id', notices: 'id' });
    await v16.open();
    const stored = (name: string, extra: object = {}) => ({ name, enabled: true, created_at: '', spec: { template: 'exclude', params: { match: is('id', 1), strength: 'must' } }, ...extra });
    await v16.table('rules').bulkAdd([
      stored('A curry in every meal'),
      stored('Extras at lunch: at most 4'),
      stored('My own curry wish'),
      stored('Vary dishes across the week', { default_key: 'variety' }),
      stored('Sambar: base pairing', { owner_component_id: 3 }),
    ]);
    v16.close();

    await db.open();

    const keys = Object.fromEntries((await db.rules.toArray()).map((r) => [r.name, r.default_key]));
    expect(keys).toEqual({
      'A curry in every meal': 'want-curry',
      'Extras at lunch: at most 4': 'extras-limit-lunch',
      'My own curry wish': undefined,
      'Vary dishes across the week': 'variety',
      'Sambar: base pairing': undefined,
    });
  });
});
