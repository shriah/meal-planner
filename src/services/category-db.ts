import { db, normalizeComponentCategoryRefs } from '@/db/client';
import { pairingCategories } from '@/rules';
import type { ComponentRecord } from '@/types/component';
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
      await db.components.put(normalizeComponentCategoryRefs(component, category) as ComponentRecord);
    }

    if (category.kind === 'base') {
      // A pairing left with no categories is removed, so the dish goes with any base.
      await db.rules.where('owner_component_id').above(0).modify((rule, ref) => {
        const bases = pairingCategories(rule);
        if (!bases?.includes(id) || rule.spec.template !== 'pairs_with') return;
        const rest = bases.filter((b) => b !== id);
        if (rest.length === 0) delete (ref as { value?: unknown }).value;
        else rule.spec = { ...rule.spec, params: { ...rule.spec.params, baseCategories: rest } };
      });
    }

    await db.categories.delete(id);
  });
}
