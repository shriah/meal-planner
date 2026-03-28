import type { CategoryRecord } from '@/types/category';

export function buildCategoryMap(categories: CategoryRecord[]): Map<number, CategoryRecord> {
  return new Map(
    categories
      .filter((category): category is CategoryRecord & { id: number } => category.id !== undefined)
      .map((category) => [category.id, category]),
  );
}

export function getCategoryLabel(
  categoriesById: Map<number, CategoryRecord>,
  id: number | null | undefined,
  fallback: string,
): string {
  if (id === null || id === undefined) {
    return fallback;
  }

  return categoriesById.get(id)?.name ?? fallback;
}

export function getBaseCategoryLabel(
  categoriesById: Map<number, CategoryRecord>,
  id: number | null | undefined,
): string {
  return getCategoryLabel(categoriesById, id, 'Deleted base category');
}

export function getExtraCategoryLabel(
  categoriesById: Map<number, CategoryRecord>,
  id: number | null | undefined,
): string {
  return getCategoryLabel(categoriesById, id, 'Deleted extra category');
}
