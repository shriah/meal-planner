// Upgrading a real v13 database: rules are converted to templates, unconvertible ones are listed once.
import Dexie from 'dexie';
import { afterAll, describe, expect, it } from 'vitest';
import { db, RULE_MIGRATION_NOTICE_ID } from '@/db/client';
import { all, is, oneOf } from '@/planner';
import { defaultRules, linkRule, readLink, RuleSpecSchema } from '@/rules';

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

    const rules = await db.rules.toArray();
    const keys = Object.fromEntries(rules.map((r) => [r.name, r.default_key]));
    // v17 keyed it, so v18 switched it off; v19 then keeps it as an ordinary rule, as it is not the original.
    expect(rules.find((r) => r.name === 'A curry in every meal')?.enabled).toBe(false);
    expect(rules.find((r) => r.name === 'My own curry wish')?.enabled).toBe(true);
    expect(keys).toEqual({
      'A curry in every meal': undefined,
      'Extras at lunch: at most 4': 'extras-limit-lunch',
      'My own curry wish': undefined,
      'Vary dishes across the week': 'variety',
      'Sambar: base pairing': undefined,
    });
  });

  it('v18 switches off the curry and subzi defaults and widens extras-only-when-asked to every side', async () => {
    db.close();
    await Dexie.delete('FoodPlannerDB');

    const v17 = new Dexie('FoodPlannerDB');
    v17.version(17).stores({ ...V13_STORES, rules: '++id, owner_component_id', notices: 'id' });
    await v17.open();
    const stored = (name: string, extra: object = {}) => ({ name, enabled: true, created_at: '', spec: { template: 'exclude', params: { match: is('id', 1), strength: 'must' } }, ...extra });
    await v17.table('rules').bulkAdd([
      stored('A curry in every meal', { default_key: 'want-curry' }),
      stored('My subzi wish', { default_key: 'want-subzi' }),
      stored('Extras only when a rule asks for them', { default_key: 'extras-only-when-asked' }),
      stored('Vary dishes across the week', { default_key: 'variety' }),
      stored('Always a curry', {}),
    ]);
    v17.close();

    await db.open();

    const byName = Object.fromEntries((await db.rules.toArray()).map((r) => [r.name, r]));
    expect(byName['A curry in every meal'].enabled).toBe(false);
    expect(byName['My subzi wish'].enabled).toBe(false);
    expect(byName['Vary dishes across the week'].enabled).toBe(true);
    expect(byName['Always a curry'].enabled).toBe(true);
    const sides = byName['Curries, subzis and extras only when a rule asks for them'];
    expect(sides).toMatchObject({ default_key: 'sides-only-when-asked', enabled: true, spec: { template: 'prefer' } });
    expect(byName['Extras only when a rule asks for them']).toBeUndefined();
  });

  it('v19 removes duplicate and retired rules and turns hand-written pairings into served-with links', async () => {
    db.close();
    await Dexie.delete('FoodPlannerDB');

    const v18 = new Dexie('FoodPlannerDB');
    v18.version(18).stores({
      categories: '++id, kind, name',
      components: '++id, componentType, base_type, base_category_id, extra_category, extra_category_id, *dietary_tags, *regional_tags, *occasion_tags',
      meals: '++id, base_id, curry_id, subzi_id',
      meal_extras: '[meal_id+component_id], meal_id, component_id',
      rules: '++id, owner_component_id',
      saved_plans: '++id, week_start',
      preferences: 'id',
      active_plan: 'id',
      notices: 'id',
    });
    await v18.open();
    const [idli, dosa, sambar, chutney, aloo, papad, rasam, pickle] = [1, 2, 3, 4, 5, 6, 7, 8];
    const breakfastCat = 1;
    await v18.table('categories').add({ id: breakfastCat, kind: 'base', name: 'other', created_at: '' });
    await v18.table('components').bulkAdd([
      { id: idli, name: 'Idli', componentType: 'base', base_category_id: breakfastCat },
      { id: dosa, name: 'Dosa', componentType: 'base', base_category_id: breakfastCat },
      { id: sambar, name: 'Sambar', componentType: 'curry' },
      { id: chutney, name: 'Chutney', componentType: 'extra' },
      { id: aloo, name: 'Aloo', componentType: 'subzi' },
      { id: papad, name: 'Papad', componentType: 'extra' },
      { id: rasam, name: 'Rasam', componentType: 'curry' },
      { id: pickle, name: 'Pickle', componentType: 'extra' },
    ]);
    const want = (type: 'curry' | 'subzi') => ({ template: 'require', params: { match: is('componentType', type), strength: 'prefer', cost: 5 } });
    const pairing = (when: unknown, components: number[], extra: object = {}) =>
      ({ template: 'require_with', params: { when, components, extraCategories: [], strength: 'prefer', cost: 6, ...extra } });
    const rule = (id: number, name: string, spec: object, extra: object = {}) => ({ id, name, enabled: true, created_at: '', spec, ...extra });
    const handRule = { template: 'exclude', params: { match: is('id', papad), strength: 'must' } };
    const misfits = [
      rule(10, 'When sambar', pairing(is('id', sambar), [chutney])),
      rule(11, 'With extras', pairing(is('id', idli), [chutney], { extraCategories: [1] })),
      rule(12, 'Compound', pairing(all(is('componentType', 'base'), is('id', idli)), [chutney])),
      rule(18, 'Missing base', pairing(is('id', 99), [chutney])),
      rule(19, 'Missing category', pairing(is('base_category_id', 99), [chutney])),
    ];
    await v18.table('rules').bulkAdd([
      rule(1, 'Hand rule', handRule),
      rule(2, 'Hand rule', handRule),
      rule(3, 'A curry in every meal', want('curry'), { enabled: false, default_key: 'want-curry' }),
      rule(4, 'A subzi in every meal', want('subzi'), { enabled: false, default_key: 'want-subzi' }),
      rule(5, 'My curry wish', want('curry'), { enabled: false, default_key: 'want-curry' }),
      rule(6, 'A subzi in every meal', want('subzi'), { default_key: 'want-subzi' }),
      rule(7, 'Idli and dosa sides', pairing(oneOf('id', [idli, dosa]), [sambar, chutney], { scope: { meals: ['breakfast'] } })),
      rule(8, 'Papad with dosa', pairing(is('id', dosa), [papad]), { enabled: false }),
      rule(9, 'Rasam with other', pairing(is('base_category_id', breakfastCat), [rasam])),
      ...misfits,
      { id: 13, ...linkRule({ id: aloo, name: 'Aloo' }, { mode: 'serve', target: 'base_dish', values: [dosa] }), enabled: true, created_at: '' },
      // Sometimes, so merging it into Aloo's always link would make it a hard rule: it stays as it is.
      rule(14, 'Aloo with idli', pairing(is('id', idli), [aloo], { cost: 3 })),
      rule(20, 'Aloo with idli, always', pairing(is('id', idli), [aloo], { strength: 'must', cost: undefined })),
      { id: 15, ...linkRule({ id: pickle, name: 'Pickle' }, { mode: 'serve', target: 'base_dish', values: [idli], strength: 'moderately' }), enabled: true, created_at: '' },
      // Switched off, so merging it into Pickle's live link would switch it on: it stays as it is.
      rule(16, 'Pickle with dosa, off', pairing(is('id', dosa), [pickle]), { enabled: false }),
      // Sambar's new link holds at breakfast only, so this one keeps Sambar; Pickle merges.
      rule(17, 'Pickle and sambar with dosa', pairing(is('id', dosa), [pickle, sambar])),
    ]);
    v18.close();

    await db.open();

    const rules = await db.rules.toArray();
    const byId = new Map(rules.map((r) => [r.id, r]));
    expect(rules.filter((r) => r.name === 'Hand rule').map((r) => r.id)).toEqual([1]);
    expect([3, 4, 7, 8, 9, 20].filter((id) => byId.has(id))).toEqual([]);
    expect(rules.some((r) => r.default_key === 'want-curry' || r.default_key === 'want-subzi')).toBe(false);
    expect(byId.get(5)).toMatchObject({ name: 'My curry wish', enabled: false });
    expect(byId.get(6)).toMatchObject({ name: 'A subzi in every meal', enabled: true });
    for (const misfit of misfits) expect(byId.get(misfit.id)).toEqual(misfit);

    const owned = (id: number) => rules.filter((r) => r.owner_component_id === id);
    for (const dish of [sambar, chutney]) {
      expect(owned(dish)).toHaveLength(1);
      expect(owned(dish)[0].enabled).toBe(true);
      expect(readLink(owned(dish)[0])).toEqual({ mode: 'serve', target: 'base_dish', values: [idli, dosa], strength: 'moderately', scope: { meals: ['breakfast'] } });
    }
    expect(owned(papad)).toHaveLength(1);
    expect(owned(papad)[0].enabled).toBe(false);
    expect(readLink(owned(papad)[0])).toMatchObject({ target: 'base_dish', values: [dosa] });
    expect(owned(rasam)).toHaveLength(1);
    expect(readLink(owned(rasam)[0])).toMatchObject({ mode: 'serve', target: 'base_category', values: [breakfastCat] });
    expect(owned(aloo).map((r) => r.id)).toEqual([13]);
    expect(readLink(owned(aloo)[0])).toEqual({ mode: 'serve', target: 'base_dish', values: [dosa, idli], strength: 'always' });
    expect(byId.get(14)?.spec).toEqual(pairing(is('id', idli), [aloo], { cost: 3 }));
    expect(byId.get(16)).toMatchObject({ enabled: false, spec: pairing(is('id', dosa), [pickle]) });
    expect(byId.get(17)?.spec).toEqual(pairing(is('id', dosa), [sambar]));
    expect(owned(pickle).map((r) => r.id)).toEqual([15]);
    expect(readLink(owned(pickle)[0])).toMatchObject({ values: [idli, dosa], strength: 'moderately' });
    for (const r of rules) expect(RuleSpecSchema.safeParse(r.spec).success).toBe(true);
  });

  it('v20 merges a library seeded twice into one copy of each category and dish', async () => {
    db.close();
    await Dexie.delete('FoodPlannerDB');

    const v19 = new Dexie('FoodPlannerDB');
    v19.version(19).stores({ ...V13_STORES, rules: '++id, owner_component_id', notices: 'id' });
    await v19.open();
    const now = '';
    // Two copies of everything, as a double seed leaves it: categories 1-2 and 3-4, dishes 1-3 and 4-6.
    await v19.table('categories').bulkAdd([
      { id: 1, kind: 'base', name: 'rice-based', created_at: now }, { id: 2, kind: 'extra', name: 'condiment', created_at: now },
      { id: 3, kind: 'base', name: 'Rice-based', created_at: now }, { id: 4, kind: 'extra', name: 'condiment', created_at: now },
    ]);
    const dish = (id: number, name: string, componentType: string, extra: object = {}) =>
      ({ id, name, componentType, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: now, ...extra });
    await v19.table('components').bulkAdd([
      dish(1, 'Rice', 'base', { base_category_id: 1 }), dish(2, 'Sambar', 'curry'), dish(3, 'Pickle', 'extra', { extra_category_id: 2 }),
      dish(4, 'Rice', 'base', { base_category_id: 3 }), dish(5, 'Sambar', 'curry'), dish(6, 'Pickle', 'extra', { extra_category_id: 4 }),
    ]);
    const owned = (rule: ReturnType<typeof linkRule>, id: number) => ({ ...rule, id, enabled: true, created_at: now });
    await v19.table('rules').bulkAdd([
      owned(linkRule({ id: 2, name: 'Sambar' }, { mode: 'serve', target: 'base_dish', values: [1] }), 1),
      owned(linkRule({ id: 5, name: 'Sambar' }, { mode: 'serve', target: 'base_dish', values: [4] }), 2),
      owned(linkRule({ id: 6, name: 'Pickle' }, { mode: 'never', target: 'base_category', values: [3] }), 3),
      { id: 4, name: 'Rice at lunch', enabled: true, created_at: now, spec: { template: 'allowed_meals', params: { match: is('base_category_id', 1), meals: ['lunch'], strength: 'must' } } },
      { id: 5, name: 'Rice at lunch', enabled: true, created_at: now, spec: { template: 'allowed_meals', params: { match: is('base_category_id', 3), meals: ['lunch'], strength: 'must' } } },
      { id: 6, name: 'Condiment with rice', enabled: true, created_at: now, spec: { template: 'require_with', params: { when: oneOf('id', [1, 4]), components: [], extraCategories: [4], strength: 'must' } } },
    ]);
    await v19.table('active_plan').put({ id: 'current', updated_at: now, locks: {}, plan: { slots: [{ day: 'monday', meal_slot: 'lunch', base_id: 4, curry_id: 5, extra_ids: [3, 6] }] } });
    v19.close();

    await db.open();

    expect((await db.categories.toArray()).map((c) => c.id)).toEqual([1, 2]);
    expect((await db.components.toArray()).map((c) => [c.id, c.base_category_id ?? c.extra_category_id ?? null])).toEqual([[1, 1], [2, null], [3, 2]]);
    const rules = await db.rules.toArray();
    // The kept Sambar keeps its own served-with link; the copy's identical one is dropped.
    expect(rules.filter((r) => r.owner_component_id === 2).map((r) => readLink(r))).toEqual([{ mode: 'serve', target: 'base_dish', values: [1], strength: 'always' }]);
    // The copy of Pickle had a link the kept one lacked: it moves over, pointing at the kept category.
    const pickle = rules.filter((r) => r.owner_component_id === 3);
    expect(pickle.map((r) => readLink(r))).toEqual([{ mode: 'never', target: 'base_category', values: [1], strength: 'always' }]);
    expect(pickle[0].spec).toMatchObject({ params: { match: is('id', 3) } });
    expect(rules.filter((r) => r.owner_component_id === 5 || r.owner_component_id === 6)).toEqual([]);
    // Hand-written rules point at the kept ids, and the two that became identical are one.
    expect(rules.filter((r) => r.name === 'Rice at lunch')).toHaveLength(1);
    expect(rules.find((r) => r.name === 'Condiment with rice')?.spec).toMatchObject({ params: { when: oneOf('id', [1]), extraCategories: [2] } });
    expect((await db.active_plan.get('current'))?.plan.slots[0]).toMatchObject({ base_id: 1, curry_id: 2, extra_ids: [3] });
    expect(rules.every((r) => RuleSpecSchema.safeParse(r.spec).success)).toBe(true);
  });
});
