'use client'

import { useEffect, useState } from 'react';
import { db, type RuleRecord } from '@/db/client';
import { is, type Matcher, type Meal } from '@/planner';
import { dayRule, defaultRules, exclusionRule, pairingRule } from '@/rules';
import type { ComponentRecord } from '@/types/component';
import type { CategoryKind } from '@/types/category';

type SeedData = typeof import('@/db/seed-data');

// One read and one bulk add: a per-name async loop here lost the seed transaction (Dexie's zone).
async function ensureSeedCategories({ BUILT_IN_BASE_SEED_NAMES, BUILT_IN_EXTRA_SEED_NAMES }: SeedData): Promise<{
  base: Record<string, number>;
  extra: Record<string, number>;
}> {
  const wanted: [CategoryKind, readonly string[]][] = [['base', BUILT_IN_BASE_SEED_NAMES], ['extra', BUILT_IN_EXTRA_SEED_NAMES]];
  const byKey = new Map((await db.categories.toArray()).map((category) => [`${category.kind}:${category.name}`, category.id]));

  const now = new Date().toISOString();
  const missing = wanted.flatMap(([kind, names]) => names.filter((name) => !byKey.has(`${kind}:${name}`)).map((name) => ({ kind, name, created_at: now })));
  const ids = await db.categories.bulkAdd(missing, { allKeys: true });
  missing.forEach((c, i) => byKey.set(`${c.kind}:${c.name}`, Number(ids[i])));

  const lookup = (kind: CategoryKind, names: readonly string[]) => Object.fromEntries(names.map((name) => [name, byKey.get(`${kind}:${name}`)!]));
  return { base: lookup('base', BUILT_IN_BASE_SEED_NAMES), extra: lookup('extra', BUILT_IN_EXTRA_SEED_NAMES) };
}

let seeding: Promise<void> | undefined;

/** Seeds an empty library. React runs effects twice in development, so overlapping calls share one run. */
export function runSeed(): Promise<void> {
  seeding ??= (async () => {
    const data = await import('@/db/seed-data');
    await db.transaction('rw', db.categories, db.components, db.rules, () => seed(data));
  })().finally(() => { seeding = undefined; });
  return seeding;
}

async function seed(data: SeedData): Promise<void> {
  const count = await db.components.count();
  if (count > 0) return; // Already seeded

  const {
    materializePooriSeed,
    materializeSeedComponents,
    resolveSeededCurryCompatibilityIds,
    seededDays,
  } = data;
  const categoryLookup = await ensureSeedCategories(data);
  const pooriRecord = materializePooriSeed(categoryLookup);
  const seededComponents = materializeSeedComponents(categoryLookup);

  // Insert Poori first to capture its auto-assigned ID
  const pooriId = (await db.components.add(pooriRecord as ComponentRecord)) as number;

  // Insert remaining components (everything except Poori)
  const rest = seededComponents.filter(c => c.name !== 'Poori');
  const restIds = await db.components.bulkAdd(rest as ComponentRecord[], { allKeys: true });

  const now = new Date().toISOString();
  await db.rules.bulkAdd(defaultRules({ breakfast: 2, lunch: 3, dinner: 3 }).map((r) => ({ ...r, enabled: true, created_at: now })));

  // Default rules: which meals each kind of base suits.
  const onlyAt = (name: string, match: Matcher, meals: Meal[]): Omit<RuleRecord, 'id'> => ({
    name,
    enabled: true,
    spec: { template: 'allowed_meals', params: { match, meals, strength: 'must' } },
    created_at: now,
  });
  await db.rules.bulkAdd([
    onlyAt('Other: breakfast and dinner', is('base_category_id', categoryLookup.base.other), ['breakfast', 'dinner']),
    onlyAt('Rice-based: lunch only', is('base_category_id', categoryLookup.base['rice-based']), ['lunch']),
    onlyAt('Bread-based: dinner only', is('base_category_id', categoryLookup.base['bread-based']), ['dinner']),
    onlyAt('Poori: breakfast only', is('id', pooriId), ['breakfast']),
  ]);

  // Curated curry pairings and the days a dish suits, owned by each dish so they are edited from its form.
  // A curated empty pairing means the curry is never planned automatically.
  const seeded = [{ id: pooriId, c: pooriRecord }, ...rest.map((c, i) => ({ id: restIds[i], c }))];
  const owned = seeded.flatMap(({ id, c }) => {
    const dish = { id, name: c.name };
    const bases = c.componentType === 'curry' ? resolveSeededCurryCompatibilityIds(c.name, categoryLookup) : undefined;
    const days = seededDays(c.name);
    return [
      ...(bases ? [bases.length ? pairingRule(dish, bases) : exclusionRule(dish)] : []),
      ...(days ? [dayRule(dish, days)] : []),
    ];
  });
  await db.rules.bulkAdd(owned.map((r) => ({ ...r, enabled: true, created_at: now })));
}

export function SeedBootstrap({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    runSeed().then(() => setReady(true));
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
