/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/client';
import { RuleFields } from './RuleFields';
import type { RuleFormState } from '../types';

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  await db.categories.clear();
  await db.components.clear();
  await db.rules.clear();
});

async function seedCategories() {
  await db.categories.bulkAdd([
    { kind: 'base', name: 'Millet-based', created_at: '2026-03-28T00:00:00.000Z' },
    { kind: 'base', name: 'Fermented', created_at: '2026-03-28T00:00:00.000Z' },
    { kind: 'extra', name: 'Pickle', created_at: '2026-03-28T00:00:00.000Z' },
    { kind: 'extra', name: 'Chutney', created_at: '2026-03-28T00:00:00.000Z' },
  ]);
}

function buildState(): RuleFormState {
  return {
    name: 'Dynamic categories',
    target: { mode: 'base_category', base_category_id: 1 },
    days: [],
    slots: [],
    selection: '',
    allowed_slots: [],
    skip_component_types: [],
    require_extra_category_ids: [],
  };
}

describe('RuleFields', () => {
  it('renders live base-category and extra-category choices from Dexie categories', async () => {
    await seedCategories();

    render(<RuleFields state={buildState()} dispatch={vi.fn()} />);

    expect(await screen.findByLabelText('Millet-based')).toBeInTheDocument();
    expect(screen.getByLabelText('Fermented')).toBeInTheDocument();
    expect(screen.getByLabelText('Pickle')).toBeInTheDocument();
    expect(screen.getByLabelText('Chutney')).toBeInTheDocument();
    expect(screen.queryByLabelText('rice-based')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('condiment')).not.toBeInTheDocument();
  });
});
