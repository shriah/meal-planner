import { db, normalizeComponentCategoryRefs } from '@/db/client';
import { legacyPartIds } from '@/db/parts';
import { ensurePartsAndTagGroups } from '@/db/parts-store';
import { linkRule, readLink } from '@/rules';
import type { ComponentRecord } from '@/types/component';
import type { CategoryKind, CategoryRecord } from '@/types/category';

export async function getCategoriesByKind(kind: CategoryKind): Promise<CategoryRecord[]> {
  return db.categories.where('kind').equals(kind).sortBy('name');
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
  await db.transaction('rw', db.categories, db.components, db.rules, async () => {
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

    // A link rule loses the deleted category; one left with none is removed (the dish is then unlimited).
    const target = category.kind === 'base' ? 'base_category' : 'extra_category';
    await db.rules.where('owner_component_id').above(0).modify((rule, ref) => {
      const link = readLink(rule);
      if (!link || link.target !== target || !link.values.includes(id)) return;
      const rest = link.values.filter((v) => v !== id);
      if (rest.length === 0) delete (ref as { value?: unknown }).value;
      else rule.spec = linkRule({ id: rule.owner_component_id as number, name: '' }, { ...link, values: rest }).spec;
    });

    await db.categories.delete(id);
  });
}
