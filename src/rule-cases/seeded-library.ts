// The shipped seed library (ids from 100) with its default and conditional-link rules, as the search-budget measurements
// and the repair snapshot build it.
import { materializePooriSeed, materializeSeedComponents, type SeedCategoryLookup } from '@/db/seed-data';
import type { ComponentLike } from '@/planner';
import { compileRules, defaultRules, linkRule, type RuleRecord } from '@/rules';

const CAT = { base: { 'rice-based': 1, 'bread-based': 2, other: 3 }, extra: { liquid: 11, crunchy: 12, condiment: 13, dairy: 14, sweet: 15 } } satisfies SeedCategoryLookup;
const CREATED = '2026-01-01T00:00:00.000Z';

export function seededLibrary(): ComponentLike[] {
  return [...materializeSeedComponents(CAT), materializePooriSeed(CAT)].map((c, i) => ({
    ...c, id: 100 + i, frequency: i % 7 === 0 ? 'frequent' : i % 11 === 0 ? 'rare' : 'normal',
  }));
}

/** The seeded library's constraints: the defaults, plus the three measurement links when `withLinks`. */
export function seededConstraints(lib: ComponentLike[], withLinks: boolean) {
  const d = (name: string) => {
    const x = lib.find((y) => y.name === name);
    if (!x) throw new Error(`no seed dish ${name}`);
    return x;
  };
  const links = withLinks
    ? [
        linkRule(d('Plain Rice'), { mode: 'comes', target: 'curry_dish', values: [d('Sambar').id] }),
        linkRule(d('Plain Rice'), { mode: 'comes', target: 'extra_dish', values: [d('Papad').id], when: { curry: [d('Sambar').id] } }),
        linkRule(d('Idli'), { mode: 'comes', target: 'extra_dish', values: [d('Coconut Chutney').id] }),
      ]
    : [];
  const records: RuleRecord[] = [...links, ...defaultRules()].map((r, i) => ({ ...r, id: i + 1, enabled: true, created_at: CREATED }));
  return compileRules(records, {
    components: new Set(lib.map((x) => x.id)),
    baseCategories: new Set([1, 2, 3]),
    extraCategories: new Set([11, 12, 13, 14, 15]),
  }).constraints;
}
