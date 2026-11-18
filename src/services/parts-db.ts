import { db } from '@/db/client';
import { CONVERTED_PARTS, CONVERTED_TAG_GROUP_KEYS, CONVERTED_TAG_GROUPS, convertDish, type ConvertLookup } from '@/db/parts';
import { ensurePartsAndTagGroups } from '@/db/parts-store';
import type { ComponentRecord, CurryCategory } from '@/types/component';
import type { PartRecord } from '@/types/part';
import type { TagGroupRecord } from '@/types/tags';

export async function getParts(): Promise<PartRecord[]> {
  return (await db.parts.toArray()).sort((a, b) => a.position - b.position);
}

export async function getTagGroups(): Promise<TagGroupRecord[]> {
  return (await db.tag_groups.toArray()).sort((a, b) => a.position - b.position);
}

/**
 * The lookup `convertDish` needs, built from stored data. Parts and tag groups missing from the library are created
 * (so this runs inside a transaction that includes `db.parts`, `db.tag_groups` and `db.categories`).
 */
export async function loadConvertLookup(): Promise<ConvertLookup> {
  const { parts, tagGroups } = await ensurePartsAndTagGroups();
  const categories = await db.categories.toArray();
  const partTypes = Object.keys(CONVERTED_PARTS) as (keyof typeof CONVERTED_PARTS)[];
  const groupOf = (k: (typeof CONVERTED_TAG_GROUP_KEYS)[number]) => tagGroups.find((g) => g.name === CONVERTED_TAG_GROUPS[k].name)!;
  return {
    parts: Object.fromEntries(partTypes.map((t) => [t, parts.find((p) => p.name === CONVERTED_PARTS[t].name)!.id])) as ConvertLookup['parts'],
    curryCategory: new Map(categories.filter((c) => c.kind === 'curry').map((c) => [c.name as CurryCategory, c.id])),
    knownCategories: new Set(categories.map((c) => c.id)),
    tagGroups: Object.fromEntries(
      CONVERTED_TAG_GROUP_KEYS.map((k) => [k, { id: groupOf(k).id, valueId: new Map(groupOf(k).values.map((v) => [v.name, v.id])) }]),
    ) as ConvertLookup['tagGroups'],
  };
}

const DERIVED = ['part_id', 'category_id', 'tags'] as const;

/**
 * The derived fields (`part_id`, `category_id`, `tags`) of `dish` that differ from what `dish` already holds, ready to
 * merge into a write. A curry whose curry type has no Curry category yet gets one. Runs inside a transaction that
 * includes `db.parts`, `db.tag_groups` and `db.categories`.
 */
export async function derivedChanges(dish: ComponentRecord): Promise<Partial<ComponentRecord>> {
  const lookup = await loadConvertLookup();
  if (dish.componentType === 'curry' && dish.curry_category && !lookup.curryCategory.has(dish.curry_category)) {
    const id = (await db.categories.add({
      kind: 'curry',
      name: dish.curry_category,
      part_id: lookup.parts.curry,
      created_at: new Date().toISOString(),
    })) as number;
    lookup.curryCategory.set(dish.curry_category, id);
    (lookup.knownCategories as Set<number>).add(id);
  }
  const derived = convertDish(dish, lookup);
  const changes: Record<string, unknown> = {};
  for (const key of DERIVED) {
    if (JSON.stringify(derived[key] ?? undefined) !== JSON.stringify(dish[key] ?? undefined)) changes[key] = derived[key];
  }
  return changes as Partial<ComponentRecord>;
}

const SOURCES = [
  'componentType', 'base_category_id', 'extra_category_id', 'curry_category',
  'dietary_tags', 'protein_tag', 'regional_tags', 'occasion_tags',
] as const;

/** Whether an edit changes any old field the derived ones come from; an edit that does not must not rewrite them. */
export function changesDerivationSources(stored: ComponentRecord, after: ComponentRecord): boolean {
  return SOURCES.some((key) => JSON.stringify(stored[key] ?? null) !== JSON.stringify(after[key] ?? null));
}
