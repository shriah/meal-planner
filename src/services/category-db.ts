import { db, normalizeComponentCategoryRefs } from '@/db/client';
import type { CategoryKind, CategoryRecord } from '@/types/category';

export async function getCategoriesByKind(kind: CategoryKind): Promise<CategoryRecord[]> {
  return db.categories.where('kind').equals(kind).sortBy('name');
}

export async function addCategory(
  category: Pick<CategoryRecord, 'kind' | 'name'>,
): Promise<number> {
  return db.categories.add({
    ...category,
    created_at: new Date().toISOString(),
  }) as Promise<number>;
}

export async function renameCategory(id: number, name: string): Promise<void> {
  await db.categories.update(id, { name });
}

/**
 * Delete a category and clear component references to it. Rules that refer to it are left as they
 * are: planning skips them and names them, so the user can see and fix what changed.
 */
export async function deleteCategory(id: number): Promise<void> {
  await db.transaction('rw', db.categories, db.components, async () => {
    const category = await db.categories.get(id);
    if (!category) {
      return;
    }

    const components = await db.components.toArray();
    for (const component of components) {
      await db.components.put(normalizeComponentCategoryRefs(component, category));
    }

    await db.categories.delete(id);
  });
}
