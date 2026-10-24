'use client'

import { useEffect, useState } from 'react';
import { db, type RuleRecord } from '@/db/client';
import { is, type Matcher, type Meal } from '@/planner';
import type { ComponentRecord } from '@/types/component';
import type { CategoryKind } from '@/types/category';

async function ensureSeedCategories(): Promise<{
  base: Record<string, number>;
  extra: Record<string, number>;
}> {
  const {
    BUILT_IN_BASE_SEED_NAMES,
    BUILT_IN_EXTRA_SEED_NAMES,
  } = await import('@/db/seed-data');

  const categories = await db.categories.toArray();
  const byKey = new Map(
    categories
      .map((category) => [`${category.kind}:${category.name}`, category.id]),
  );

  const now = new Date().toISOString();

  async function ensureKind(
    kind: CategoryKind,
    names: readonly string[],
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {};

    for (const name of names) {
      const key = `${kind}:${name}`;
      let id = byKey.get(key);
      if (id === undefined) {
        id = Number(await db.categories.add({ kind, name, created_at: now }));
        byKey.set(key, id);
      }
      result[name] = id;
    }

    return result;
  }

  return {
    base: await ensureKind('base', BUILT_IN_BASE_SEED_NAMES),
    extra: await ensureKind('extra', BUILT_IN_EXTRA_SEED_NAMES),
  };
}

export async function runSeed(): Promise<void> {
  const count = await db.components.count();
  if (count > 0) return; // Already seeded

  const {
    materializePooriSeed,
    materializeSeedComponents,
  } = await import('@/db/seed-data');
  const categoryLookup = await ensureSeedCategories();
  const pooriRecord = materializePooriSeed(categoryLookup);
  const seededComponents = materializeSeedComponents(categoryLookup);

  // Insert Poori first to capture its auto-assigned ID
  const pooriId = (await db.components.add(pooriRecord as ComponentRecord)) as number;

  // Insert remaining components (everything except Poori)
  const rest = seededComponents.filter(c => c.name !== 'Poori');
  await db.components.bulkAdd(rest as ComponentRecord[]);

  // Seed default preferences (slot_restrictions cleared — rules used instead)
  await db.preferences.put({
    id: 'prefs',
    slot_restrictions: {
      base_type_slots: {},
      component_slot_overrides: {},
    },
    extra_quantity_limits: { breakfast: 2, lunch: 3, dinner: 3 },
    base_type_rules: [],
  });

  const now = new Date().toISOString();

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
}

export function SeedBootstrap({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    runSeed().then(() => setReady(true));
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
