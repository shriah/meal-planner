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
        type: 'rule',
        target: { mode: 'base_type', base_type: 'other' },
        scope: { days: null, slots: null },
        effects: [{ kind: 'allowed_slots', slots: ['breakfast', 'dinner'] }],
      },
      created_at: now,
    },
    {
      name: 'Rice-based: lunch only',
      enabled: true,
      compiled_filter: {
        type: 'rule',
        target: { mode: 'base_type', base_type: 'rice-based' },
        scope: { days: null, slots: null },
        effects: [{ kind: 'allowed_slots', slots: ['lunch'] }],
      },
      created_at: now,
    },
    {
      name: 'Bread-based: dinner only',
      enabled: true,
      compiled_filter: {
        type: 'rule',
        target: { mode: 'base_type', base_type: 'bread-based' },
        scope: { days: null, slots: null },
        effects: [{ kind: 'allowed_slots', slots: ['dinner'] }],
      },
      created_at: now,
    },
    {
      name: 'Poori: breakfast only',
      enabled: true,
      compiled_filter: {
        type: 'rule',
        target: { mode: 'component', component_id: pooriId },
        scope: { days: null, slots: ['lunch', 'dinner'] },
        effects: [{ kind: 'exclude' }],
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
