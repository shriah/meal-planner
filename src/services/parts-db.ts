import { db } from '@/db/client';
import { convertDish } from '@/db/parts';
import { loadConvertLookup } from '@/db/parts-store';
import { CURRY_CATEGORIES, type ComponentRecord } from '@/types/component';
import type { PartRecord } from '@/types/part';
import type { TagGroupRecord } from '@/types/tags';

export async function getParts(): Promise<PartRecord[]> {
  return (await db.parts.toArray()).sort((a, b) => a.position - b.position);
}

export async function getTagGroups(): Promise<TagGroupRecord[]> {
  return (await db.tag_groups.toArray()).sort((a, b) => a.position - b.position);
}

const DERIVED = ['part_id', 'category_id', 'tags'] as const;

/**
 * The derived fields (`part_id`, `category_id`, `tags`) of `dish` that differ from what `dish` already holds, ready to
 * merge into a write. A curry whose curry type has no Curry category yet gets one. Runs inside a transaction that
 * includes `db.parts`, `db.tag_groups` and `db.categories`.
 */
export async function derivedChanges(dish: ComponentRecord): Promise<Partial<ComponentRecord>> {
  const lookup = await loadConvertLookup();
  if (dish.componentType === 'curry' && dish.curry_category && CURRY_CATEGORIES.includes(dish.curry_category) && !lookup.curryCategory.has(dish.curry_category)) {
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
