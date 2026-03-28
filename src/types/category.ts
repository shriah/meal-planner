export type CategoryKind = 'base' | 'extra';

export interface CategoryRecord {
  id?: number;
  kind: CategoryKind;
  name: string;
  created_at: string;
}

export const BUILT_IN_BASE_CATEGORY_NAMES = ['rice-based', 'bread-based', 'other'] as const;
export const BUILT_IN_EXTRA_CATEGORY_NAMES = ['liquid', 'crunchy', 'condiment', 'dairy', 'sweet'] as const;
