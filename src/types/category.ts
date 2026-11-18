export type CategoryKind = 'base' | 'extra' | 'curry';

export interface CategoryRecord {
  id: number;
  kind: CategoryKind;
  name: string;
  /** The part this category belongs to. Set by the Stage 1 conversion; unset on rows not yet converted. */
  part_id?: number;
  created_at: string;
}

export const BUILT_IN_BASE_CATEGORY_NAMES = ['rice-based', 'bread-based', 'other'] as const;
export const BUILT_IN_EXTRA_CATEGORY_NAMES = ['liquid', 'crunchy', 'condiment', 'dairy', 'sweet'] as const;
