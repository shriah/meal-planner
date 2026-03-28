import { db, normalizeComponentCategoryRefs, normalizeRuleCategoryRefs } from '@/db/client';
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

export async function deleteCategory(id: number): Promise<void> {
  await db.transaction('rw', db.categories, db.components, db.rules, async () => {
    const category = await db.categories.get(id);
    if (!category?.id) {
      return;
    }

    const components = await db.components.toArray();
    for (const component of components) {
      const nextComponent = normalizeComponentCategoryRefs(component, category as CategoryRecord & { id: number });
      await db.components.update(component.id!, nextComponent);
    }

    const rules = await db.rules.toArray();
    for (const rule of rules) {
      const nextRule = normalizeRuleCategoryRefs(rule, category as CategoryRecord & { id: number });
      await db.rules.update(rule.id!, {
        enabled: nextRule.enabled,
        compiled_filter: nextRule.compiled_filter,
      });
    }

    await db.categories.delete(id);
  });
}
