'use client'

import { useEffect, useState } from 'react';
import { db } from '@/db/client';
import type { ComponentRecord } from '@/types/component';

export async function runSeed(): Promise<void> {
  const count = await db.components.count();
  if (count > 0) return; // Already seeded

  const { SEED_COMPONENTS, POORI_SEED } = await import('@/db/seed-data');

  // Insert Poori first to capture its auto-assigned ID
  const pooriRecord = { ...POORI_SEED };
  const pooriId = (await db.components.add(pooriRecord as ComponentRecord)) as number;

  // Insert remaining components (everything except Poori)
  const rest = SEED_COMPONENTS.filter(c => c.name !== 'Poori');
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

  // Seed default meal-template rules (equivalent to old base_type_slots prefs)
  await db.rules.bulkAdd([
    {
      name: 'Other: breakfast and dinner',
      enabled: true,
      compiled_filter: {
        type: 'meal-template',
        selector: { mode: 'base', base_type: 'other' },
        days: null,
        slots: null,
        allowed_slots: ['breakfast', 'dinner'],
        exclude_component_types: [],
        exclude_extra_categories: [],
        require_extra_category: null,
      },
      created_at: now,
    },
    {
      name: 'Rice-based: lunch only',
      enabled: true,
      compiled_filter: {
        type: 'meal-template',
        selector: { mode: 'base', base_type: 'rice-based' },
        days: null,
        slots: null,
        allowed_slots: ['lunch'],
        exclude_component_types: [],
        exclude_extra_categories: [],
        require_extra_category: null,
      },
      created_at: now,
    },
    {
      name: 'Bread-based: dinner only',
      enabled: true,
      compiled_filter: {
        type: 'meal-template',
        selector: { mode: 'base', base_type: 'bread-based' },
        days: null,
        slots: null,
        allowed_slots: ['dinner'],
        exclude_component_types: [],
        exclude_extra_categories: [],
        require_extra_category: null,
      },
      created_at: now,
    },
    {
      name: 'Poori: breakfast only',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'exclude',
        days: null,
        slots: ['lunch', 'dinner'],
        match: { mode: 'component', component_id: pooriId },
      },
      created_at: now,
    },
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
