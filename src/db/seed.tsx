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

  // Seed default preferences with Poori override
  await db.preferences.put({
    id: 'prefs',
    slot_restrictions: {
      base_type_slots: {
        other: ['breakfast', 'dinner'],
        'rice-based': ['lunch'],
        'bread-based': ['dinner'],
      },
      component_slot_overrides: {
        [pooriId]: ['breakfast'],
      },
    },
    extra_quantity_limits: { breakfast: 2, lunch: 3, dinner: 3 },
    base_type_rules: [],
  });
}

export function SeedBootstrap({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    runSeed().then(() => setReady(true));
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
