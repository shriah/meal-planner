// The shared test library: fixed dishes and categories, so a case's result changes only when the rules
// or the planner do. It holds no days, meals or never-auto rules; a case adds those. Case-only dishes use
// ids from 900 up.
import type { CategoryRecord } from '@/types/category';
import type { BaseType, ComponentRecord, CurryCategory, ExtraCategory } from '@/types/component';
import type { CaseLibrary } from './types';

const CREATED = '2026-01-01T00:00:00.000Z';

const cat = (id: number, kind: 'base' | 'extra', name: string): CategoryRecord => ({ id, kind, name, created_at: CREATED });
const CATEGORIES: CategoryRecord[] = [
  cat(1, 'base', 'Rice-based'), cat(2, 'base', 'Tiffin'), cat(3, 'base', 'Breads'),
  cat(11, 'extra', 'Condiments'), cat(12, 'extra', 'Crunchy'), cat(13, 'extra', 'Dairy'),
];

const fields = () => ({ dietary_tags: ['veg' as const], regional_tags: [], occasion_tags: [], frequency: 'normal' as const, created_at: CREATED });
const base = (id: number, name: string, base_category_id: number, base_type: BaseType): ComponentRecord => ({
  ...fields(), id, name, componentType: 'base', base_category_id, base_type,
});
const curry = (id: number, name: string, curry_category: CurryCategory): ComponentRecord => ({
  ...fields(), id, name, componentType: 'curry', curry_category,
});
const subzi = (id: number, name: string): ComponentRecord => ({ ...fields(), id, name, componentType: 'subzi' });
const extra = (id: number, name: string, extra_category_id: number, extra_category: ExtraCategory): ComponentRecord => ({
  ...fields(), id, name, componentType: 'extra', extra_category_id, extra_category,
});

const DISHES: ComponentRecord[] = [
  base(1, 'Pongal', 1, 'rice-based'), base(2, 'Rice', 1, 'rice-based'),
  base(3, 'Idli', 2, 'other'), base(4, 'Dosa', 2, 'other'), base(5, 'Upma', 2, 'other'),
  base(6, 'Roti', 3, 'bread-based'), base(7, 'Chapati', 3, 'bread-based'),
  curry(8, 'Sambar', 'lentil'), curry(9, 'Rasam', 'soup'), curry(10, 'Dal', 'lentil'), curry(11, 'Chole', 'legume'),
  subzi(12, 'Beans Poriyal'), subzi(13, 'Aloo Gobi'),
  extra(14, 'Coconut Chutney', 11, 'condiment'), extra(15, 'Pickle', 11, 'condiment'),
  extra(16, 'Papad', 12, 'crunchy'), extra(17, 'Curd', 13, 'dairy'),
  // The spec names 17 dishes and the brief asks for 18: this is the one added to make up the count.
  extra(18, 'Tomato Chutney', 11, 'condiment'),
];

/** A library of these dishes and categories, with lookups by name. */
export function libraryOf(dishes: ComponentRecord[], categories: CategoryRecord[]): CaseLibrary {
  return {
    dishes,
    categories,
    dish(name) {
      const d = dishes.find((x) => x.name === name);
      if (!d) throw new Error(`no test dish "${name}"`);
      return d;
    },
    category(name) {
      const c = categories.find((x) => x.name === name);
      if (!c) throw new Error(`no test category "${name}"`);
      return c;
    },
  };
}

export const TEST_LIBRARY: CaseLibrary = libraryOf(DISHES, CATEGORIES);
