// The shipped seed library (ids from 100) with its default and conditional-link rules, as the search-budget measurements
// and the repair snapshot build it.
import { caseLookup } from './library';
import type { CategoryRecord } from '@/types/category';
import { materializePooriSeed, materializeSeedComponents, type SeedCategoryLookup } from '@/db/seed-data';
import { convertDish } from '@/db/parts';
import type { ComponentLike } from '@/planner';
import { compileRules, defaultRules, linkRule, type RuleRecord } from '@/rules';

const CAT = { base: { 'rice-based': 1, 'bread-based': 2, other: 3 }, extra: { liquid: 11, crunchy: 12, condiment: 13, dairy: 14, sweet: 15 } } satisfies SeedCategoryLookup;
const CREATED = '2026-01-01T00:00:00.000Z';

const CATEGORIES: CategoryRecord[] = [...Object.values(CAT.base), ...Object.values(CAT.extra)].map((id) => ({
  id, kind: id < 10 ? 'base' : 'extra', name: `category ${id}`, created_at: CREATED,
}));

export function seededLibrary(): ComponentLike[] {
  const lookup = caseLookup(CATEGORIES);
  return [...materializeSeedComponents(CAT), materializePooriSeed(CAT)].map((c, i) =>
    convertDish({ ...c, id: 100 + i, frequency: i % 7 === 0 ? 'frequent' : i % 11 === 0 ? 'rare' : 'normal' }, lookup));
}

export function seedDish(lib: ComponentLike[], name: string): ComponentLike {
  const x = lib.find((y) => y.name === name);
  if (!x) throw new Error(`no seed dish ${name}`);
  return x;
}

/** The three links of the search-budget measurements. */
export function seededLinks(lib: ComponentLike[]) {
  const d = (name: string) => seedDish(lib, name);
  return [
    linkRule(d('Plain Rice'), { mode: 'comes', target: 'curry_dish', values: [d('Sambar').id] }),
    linkRule(d('Plain Rice'), { mode: 'comes', target: 'extra_dish', values: [d('Papad').id], when: { curry: [d('Sambar').id] } }),
    linkRule(d('Idli'), { mode: 'comes', target: 'extra_dish', values: [d('Coconut Chutney').id] }),
  ];
}

/** Compiled constraints (and issues) for `links` ahead of the default rules, over a seeded-library cut. */
export function constraintsFor(lib: ComponentLike[], links: ReturnType<typeof seededLinks>) {
  const records: RuleRecord[] = [...links, ...defaultRules()].map((r, i) => ({ ...r, id: i + 1, enabled: true, created_at: CREATED }));
  return compileRules(records, {
    components: new Set(lib.map((x) => x.id)),
    baseCategories: new Set([1, 2, 3]),
    extraCategories: new Set([11, 12, 13, 14, 15]),
  });
}

/** The seeded library's constraints: the defaults, plus the three measurement links when `withLinks`. */
export const seededConstraints = (lib: ComponentLike[], withLinks: boolean) =>
  constraintsFor(lib, withLinks ? seededLinks(lib) : []).constraints;
