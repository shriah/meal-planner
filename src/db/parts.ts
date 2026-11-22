import type { CategoryRecord } from '@/types/category';
import {
  CURRY_CATEGORIES,
  DIETARY_TAGS,
  OCCASION_TAGS,
  PROTEIN_TAGS,
  REGIONAL_TAGS,
  type ComponentRecord,
  type ComponentType,
  type CurryCategory,
} from '@/types/component';
import type { PartRecord } from '@/types/part';
import type { ConvertedTagGroupKey, TagGroupRecord } from '@/types/tags';

/** Today's four component types as parts, in meal order. */
export const CONVERTED_PARTS: Record<ComponentType, Pick<PartRecord, 'name' | 'position' | 'varied'>> = {
  base: { name: 'Base', position: 0, varied: true },
  curry: { name: 'Curry', position: 1, varied: true },
  subzi: { name: 'Subzi', position: 2, varied: true },
  extra: { name: 'Extras', position: 3, varied: false },
};

export type LegacyParts = Record<ComponentType, number>;

/** The part id of each component type, matched by `legacy` (never by name). Throws when one is missing. */
export function legacyPartIds(parts: readonly Pick<PartRecord, 'id' | 'legacy'>[]): LegacyParts {
  const idOf = (type: ComponentType): number => {
    const { name } = CONVERTED_PARTS[type];
    const part = parts.find((p) => p.legacy === type);
    if (!part) throw new Error(`no "${name}" part`);
    return part.id;
  };
  return { base: idOf('base'), curry: idOf('curry'), subzi: idOf('subzi'), extra: idOf('extra') };
}

/** A dish whose part is known. */
export type DishWithPart = ComponentRecord & { part_id: number };

/** The dish with a part: its own `part_id`, or, for a dish saved by a path that gave it none, its type's part. */
export const withPart = <C extends ComponentRecord>(c: C, legacy: LegacyParts): C & { part_id: number } =>
  ({ ...c, part_id: c.part_id ?? legacy[c.componentType] });

type ConvertedTagGroup = Pick<TagGroupRecord, 'name' | 'position' | 'multiple'> & { values: readonly string[] };

/** Today's tag arrays as groups. Value ids are 1..n within each group, in list order. */
export const CONVERTED_TAG_GROUPS: Record<ConvertedTagGroupKey, ConvertedTagGroup> = {
  dietary: { name: 'Dietary', position: 0, multiple: true, values: DIETARY_TAGS },
  protein: { name: 'Protein', position: 1, multiple: false, values: PROTEIN_TAGS },
  regional: { name: 'Region', position: 2, multiple: true, values: REGIONAL_TAGS },
  occasion: { name: 'Occasion', position: 3, multiple: true, values: OCCASION_TAGS },
};

export const CONVERTED_TAG_GROUP_KEYS = Object.keys(CONVERTED_TAG_GROUPS) as ConvertedTagGroupKey[];

export interface ConvertLookup {
  parts: Record<ComponentType, number>;
  /** Curry-part category id by stored curry type. */
  curryCategory: Map<CurryCategory, number>;
  /** Ids of categories that exist; an old category reference outside this set is dropped. */
  knownCategories: ReadonlySet<number>;
  tagGroups: Record<ConvertedTagGroupKey, { id: number; valueId: Map<string, number> }>;
}

export interface ConvertIds {
  parts: Record<ComponentType, number>;
  tagGroups: Record<ConvertedTagGroupKey, number>;
}

/** Value-id map for a converted group: value name -> 1-based position in the list. */
export function convertedValueIds(key: ConvertedTagGroupKey): Map<string, number> {
  return new Map(CONVERTED_TAG_GROUPS[key].values.map((name, i) => [name, i + 1]));
}

function oldCategoryId(c: ComponentRecord, lookup: ConvertLookup): number | undefined {
  switch (c.componentType) {
    case 'base': return c.base_category_id ?? undefined;
    case 'extra': return c.extra_category_id ?? undefined;
    case 'curry': return c.curry_category ? lookup.curryCategory.get(c.curry_category) : undefined;
    case 'subzi': return undefined;
  }
}

/**
 * Derives `part_id`, `category_id` and `tags` from the old fields. Pure; the old fields are kept.
 * `category_id` is left absent (never null) when the dish has no category or its reference is unknown.
 */
export function convertDish(c: ComponentRecord, lookup: ConvertLookup): DishWithPart {
  const rest = { ...c };
  delete rest.category_id;
  const categoryId = oldCategoryId(c, lookup);
  const ids = (key: ConvertedTagGroupKey, names: readonly string[]) =>
    names.flatMap((n) => lookup.tagGroups[key].valueId.get(n) ?? []);
  const tags: Record<number, number[]> = {
    [lookup.tagGroups.dietary.id]: ids('dietary', c.dietary_tags ?? []),
    [lookup.tagGroups.protein.id]: ids('protein', c.protein_tag ? [c.protein_tag] : []),
    [lookup.tagGroups.regional.id]: ids('regional', c.regional_tags ?? []),
    [lookup.tagGroups.occasion.id]: ids('occasion', c.occasion_tags ?? []),
  };
  return {
    ...rest,
    part_id: lookup.parts[c.componentType],
    ...(categoryId !== undefined && lookup.knownCategories.has(categoryId) ? { category_id: categoryId } : {}),
    tags,
  };
}

/**
 * Converts a whole library. Categories get their part; curry types in use become new Curry categories
 * (returned without ids). Curries' `category_id` stays unset here: run `convertDish` again once the new
 * categories have ids.
 */
export function convertLibrary(
  input: { categories: CategoryRecord[]; components: ComponentRecord[] },
  ids: ConvertIds,
): { newCategories: Omit<CategoryRecord, 'id'>[]; categories: CategoryRecord[]; components: ComponentRecord[] } {
  const partOfKind = { base: ids.parts.base, extra: ids.parts.extra, curry: ids.parts.curry };
  const categories = input.categories.map((c) => ({ ...c, part_id: partOfKind[c.kind] }));
  const used = new Set(input.components.flatMap((c) => (c.componentType === 'curry' && c.curry_category ? [c.curry_category] : [])));
  const created_at = new Date().toISOString();
  const newCategories = CURRY_CATEGORIES.filter((name) => used.has(name)).map((name) => ({
    kind: 'curry' as const,
    name,
    part_id: ids.parts.curry,
    created_at,
  }));
  const lookup: ConvertLookup = {
    parts: ids.parts,
    curryCategory: new Map(),
    knownCategories: new Set(categories.map((c) => c.id)),
    tagGroups: Object.fromEntries(
      CONVERTED_TAG_GROUP_KEYS.map((k) => [k, { id: ids.tagGroups[k], valueId: convertedValueIds(k) }]),
    ) as ConvertLookup['tagGroups'],
  };
  return { newCategories, categories, components: input.components.map((c) => convertDish(c, lookup)) };
}
