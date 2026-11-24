import { db, normalizeComponentCategoryRefs } from '@/db/client';
import { legacyPartIds } from '@/db/parts';
import { ensurePartsAndTagGroups } from '@/db/parts-store';
import { linkRule, readLink } from '@/rules';
import type { ComponentRecord } from '@/types/component';
import type { CategoryKind, CategoryRecord } from '@/types/category';

export async function getCategoriesByKind(kind: CategoryKind): Promise<CategoryRecord[]> {
  return db.categories.where('kind').equals(kind).sortBy('name');
}

/** Every category, of every part, by name. */
export async function getAllCategories(): Promise<CategoryRecord[]> {
  return db.categories.orderBy('name').toArray();
}

export async function addCategory(
  category: Pick<CategoryRecord, 'kind' | 'name'>,
): Promise<number> {
  return db.transaction('rw', db.categories, db.parts, db.tag_groups, async () => {
    const { parts } = await ensurePartsAndTagGroups();
    return (await db.categories.add({
      ...category,
      part_id: legacyPartIds(parts)[category.kind],
      created_at: new Date().toISOString(),
    })) as number;
  });
}

export async function renameCategory(id: number, name: string): Promise<void> {
  await db.categories.update(id, { name });
}

/**
 * Delete a category and clear component references to it, including in the base pairings that
 * components own. Other rules that refer to it are left as they are: planning skips them and names
 * them, so the user can see and fix what changed.
 */
export async function deleteCategory(id: number): Promise<void> {
  await db.transaction('rw', db.categories, db.components, db.rules, db.parts, async () => {
    const category = await db.categories.get(id);
    if (!category) {
      return;
    }

    const components = await db.components.toArray();
    for (const component of components) {
      const cleared = normalizeComponentCategoryRefs(component, category) as ComponentRecord;
      // `category_id` never points at a deleted category.
      if (cleared.category_id === id) delete cleared.category_id;
      await db.components.put(cleared);
    }

    // A link to categories loses the deleted one; one left with none is removed (the dish is then unlimited).
    const parts = (await db.parts.toArray()).sort((a, b) => a.position - b.position);
    await db.rules.where('owner_component_id').above(0).modify((rule, ref) => {
      const link = readLink(rule, parts);
      if (!link || link.target.kind !== 'category' || !link.values.includes(id)) return;
      const rest = link.values.filter((v) => v !== id);
      if (rest.length === 0) delete (ref as { value?: unknown }).value;
      else rule.spec = linkRule({ id: rule.owner_component_id as number, name: '' }, { ...link, values: rest }, parts).spec;
    });

    await db.categories.delete(id);
  });
}
