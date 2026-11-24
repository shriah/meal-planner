import { describe, expect, it } from 'vitest';
import type { CategoryRecord } from '@/types/category';
import type { ComponentRecord, ComponentType } from '@/types/component';
import {
  CONVERTED_PARTS,
  CONVERTED_TAG_GROUPS,
  convertDish,
  convertedValueIds,
  convertLibrary,
  areCurryTypes,
  dishesWithParts,
  hasConvertedParts,
  legacyPartIds,
  type ConvertIds,
  type ConvertLookup,
} from './parts';

const PARTS: Record<ComponentType, number> = { base: 1, curry: 2, subzi: 3, extra: 4 };
const GROUPS = { dietary: 10, protein: 11, regional: 12, occasion: 13 } as const;
const ids: ConvertIds = { parts: PARTS, tagGroups: GROUPS };

const lookup = (over: Partial<ConvertLookup> = {}): ConvertLookup => ({
  parts: PARTS,
  curryCategory: new Map([['lentil', 50]]),
  knownCategories: new Set([1, 12, 50]),
  tagGroups: {
    dietary: { id: GROUPS.dietary, valueId: convertedValueIds('dietary') },
    protein: { id: GROUPS.protein, valueId: convertedValueIds('protein') },
    regional: { id: GROUPS.regional, valueId: convertedValueIds('regional') },
    occasion: { id: GROUPS.occasion, valueId: convertedValueIds('occasion') },
  },
  ...over,
});

const dish = (over: Partial<ComponentRecord>): ComponentRecord => ({
  id: 1,
  name: 'Dish',
  componentType: 'subzi',
  dietary_tags: ['veg'],
  regional_tags: [],
  occasion_tags: [],
  created_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

const cat = (id: number, kind: CategoryRecord['kind'], name: string): CategoryRecord => ({
  id, kind, name, created_at: '2026-01-01T00:00:00.000Z',
});

describe('converted parts and tag groups', () => {
  it('lists parts in meal order, Extras not varied', () => {
    expect(Object.values(CONVERTED_PARTS).map((p) => [p.name, p.position, p.varied])).toEqual([
      ['Base', 0, true], ['Curry', 1, true], ['Subzi', 2, true], ['Extras', 3, false],
    ]);
  });

  it('lists tag groups in order with the right cardinality', () => {
    expect(Object.values(CONVERTED_TAG_GROUPS).map((g) => [g.name, g.multiple])).toEqual([
      ['Dietary', true], ['Protein', false], ['Region', true], ['Occasion', true],
    ]);
    expect(convertedValueIds('occasion')).toEqual(new Map([['fasting', 1], ['festive', 2]]));
  });
});

describe('convertDish', () => {
  it('converts a curry with its curry type category and tags', () => {
    const sambar = dish({
      componentType: 'curry', curry_category: 'lentil', dietary_tags: ['veg'],
      protein_tag: 'dal', regional_tags: ['south-indian'],
    });
    const out = convertDish(sambar, lookup());
    expect(out.part_id).toBe(PARTS.curry);
    expect(out.category_id).toBe(50);
    expect(out.tags).toEqual({
      [GROUPS.dietary]: [1], [GROUPS.protein]: [6], [GROUPS.regional]: [1], [GROUPS.occasion]: [],
    });
    expect(out.curry_category).toBe('lentil');
  });

  it('takes a base category from base_category_id', () => {
    const out = convertDish(dish({ componentType: 'base', base_category_id: 1 }), lookup());
    expect([out.part_id, out.category_id]).toEqual([PARTS.base, 1]);
  });

  it('takes an extra category from extra_category_id', () => {
    const out = convertDish(dish({ componentType: 'extra', extra_category_id: 12 }), lookup());
    expect([out.part_id, out.category_id]).toEqual([PARTS.extra, 12]);
  });

  it('leaves a subzi without a category', () => {
    const out = convertDish(dish({}), lookup());
    expect(out.part_id).toBe(PARTS.subzi);
    expect('category_id' in out).toBe(false);
  });

  it('leaves category_id unset for a curry with no curry_category, without crashing', () => {
    const out = convertDish(dish({ componentType: 'curry' }), lookup());
    expect(out.part_id).toBe(PARTS.curry);
    expect('category_id' in out).toBe(false);
  });

  it('leaves category_id unset when the old category was deleted, keeping the dish', () => {
    const out = convertDish(dish({ componentType: 'base', base_category_id: 99 }), lookup());
    expect(out.name).toBe('Dish');
    expect(out.part_id).toBe(PARTS.base);
    expect('category_id' in out).toBe(false);
  });

  it('drops a stale category_id when the old fields no longer give one', () => {
    const out = convertDish(dish({ componentType: 'curry', category_id: 50 }), lookup());
    expect('category_id' in out).toBe(false);
  });

  it('gives an empty protein list when no protein is set, and does not mutate its input', () => {
    const input = dish({});
    const before = JSON.stringify(input);
    expect(convertDish(input, lookup()).tags?.[GROUPS.protein]).toEqual([]);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('convertLibrary', () => {
  const categories = [cat(1, 'base', 'rice-based'), cat(12, 'extra', 'crunchy')];

  it('gives categories their part and creates curry categories only for curry types in use', () => {
    const out = convertLibrary({
      categories,
      components: [
        dish({ id: 1, componentType: 'curry', curry_category: 'paneer' }),
        dish({ id: 2, componentType: 'curry', curry_category: 'lentil' }),
        dish({ id: 3, componentType: 'curry', curry_category: 'lentil' }),
        dish({ id: 4, componentType: 'curry' }),
      ],
    }, ids);
    expect(out.categories.map((c) => [c.name, c.part_id])).toEqual([['rice-based', PARTS.base], ['crunchy', PARTS.extra]]);
    expect(out.newCategories.map((c) => [c.kind, c.name, c.part_id])).toEqual([
      ['curry', 'lentil', PARTS.curry], ['curry', 'paneer', PARTS.curry],
    ]);
    expect(out.components.map((c) => c.part_id)).toEqual([PARTS.curry, PARTS.curry, PARTS.curry, PARTS.curry]);
    expect(out.components.every((c) => !('category_id' in c))).toBe(true);
  });

  it('converts base and extra dishes against the given categories', () => {
    const out = convertLibrary({
      categories,
      components: [
        dish({ id: 1, componentType: 'base', base_category_id: 1 }),
        dish({ id: 2, componentType: 'extra', extra_category_id: 12 }),
        dish({ id: 3, componentType: 'base', base_category_id: 77 }),
      ],
    }, ids);
    expect(out.components.map((c) => c.category_id)).toEqual([1, 12, undefined]);
  });

  it('ignores curry_category on a dish that is not a curry', () => {
    const out = convertLibrary({ categories, components: [dish({ id: 1, componentType: 'subzi', curry_category: 'paneer' })] }, ids);
    expect(out.newCategories).toEqual([]);
  });

  it('creates no curry categories for a library without curries', () => {
    const out = convertLibrary({ categories, components: [dish({ componentType: 'base' })] }, ids);
    expect(out.newCategories).toEqual([]);
  });
});

describe('legacyPartIds', () => {
  const parts = [
    { id: 7, name: 'Base', legacy: 'base' }, { id: 8, name: 'Curry', legacy: 'curry' },
    { id: 9, name: 'Subzi', legacy: 'subzi' }, { id: 10, name: 'Extras', legacy: 'extra' },
  ] as const;

  it('maps each component type to the part marked with it', () => {
    expect(legacyPartIds(parts)).toEqual({ base: 7, curry: 8, subzi: 9, extra: 10 });
  });

  it('still finds a renamed part, and never finds one by its name alone', () => {
    expect(legacyPartIds(parts.map((p) => (p.id === 7 ? { ...p, name: 'Mains' } : p)))).toEqual({ base: 7, curry: 8, subzi: 9, extra: 10 });
    expect(() => legacyPartIds(parts.map(({ id, name }) => ({ id, name })) as never)).toThrow(/Base/);
  });

  it('throws when a converted part is missing', () => {
    expect(() => legacyPartIds(parts.filter((p) => p.name !== 'Curry'))).toThrow(/Curry/);
  });
});

describe('dishesWithParts', () => {
  const parts = [
    { id: 7, legacy: 'base' }, { id: 8, legacy: 'curry' }, { id: 9, legacy: 'subzi' }, { id: 10, legacy: 'extra' },
  ] as const;

  it('gives a dish saved without a part the part of its type, as planning does, and keeps a stored part', () => {
    const out = dishesWithParts([dish({ id: 1, componentType: 'curry' }), dish({ id: 2, componentType: 'extra', part_id: 99 })], parts);
    expect(out.map((d) => d.part_id)).toEqual([8, 99]);
  });

  it('leaves the dishes as they are until the converted parts are all there', () => {
    const d = [dish({ componentType: 'curry' })];
    expect(dishesWithParts(d, undefined)[0].part_id).toBeUndefined();
    expect(dishesWithParts(d, parts.slice(0, 3))[0].part_id).toBeUndefined();
  });
});

describe('legacy-type checks', () => {
  const part = (legacy?: ComponentType) => ({ legacy });

  it('hasConvertedParts needs one part per component type', () => {
    expect(hasConvertedParts([part('base'), part('curry'), part('subzi'), part('extra')])).toBe(true);
    expect(hasConvertedParts([part('base'), part('curry'), part('subzi')])).toBe(false);
    expect(hasConvertedParts([part('base'), part('curry'), part('subzi'), part()])).toBe(false);
    expect(hasConvertedParts([])).toBe(false);
  });

  it('areCurryTypes is true only for a non-empty list of curry-kind categories', () => {
    expect(areCurryTypes([cat(1, 'curry', 'Lentil'), cat(2, 'curry', 'Veg')])).toBe(true);
    expect(areCurryTypes([cat(1, 'curry', 'Lentil'), cat(2, 'base', 'Rice')])).toBe(false);
    expect(areCurryTypes([cat(1, 'extra', 'Crunchy')])).toBe(false);
    expect(areCurryTypes([])).toBe(false);
  });
});
