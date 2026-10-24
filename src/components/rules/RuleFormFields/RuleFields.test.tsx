/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    require_component_ids: [],
    require_extra_category_ids: [],
  };
}

describe('RuleFields', () => {
  it('renders live base-category and extra-category choices from Dexie categories', async () => {
    await seedCategories();

    render(<RuleFields state={buildState()} dispatch={vi.fn()} />);

    expect(await screen.findByLabelText('Millet-based')).toBeInTheDocument();
    expect(screen.getByLabelText('Fermented')).toBeInTheDocument();
    // Extra categories come from a separate live query than the base ones above.
    expect(await screen.findByLabelText('Pickle')).toBeInTheDocument();
    expect(await screen.findByLabelText('Chutney')).toBeInTheDocument();
    expect(screen.getByLabelText('Extras')).toBeInTheDocument();
    expect(screen.queryByLabelText('rice-based')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('condiment')).not.toBeInTheDocument();
  });

  it('adds and removes live components from the required specific component effect', async () => {
    await seedCategories();
    await db.components.bulkAdd([
      {
        name: 'Muesli',
        componentType: 'base',
        base_category_id: 1,
        base_type: 'other',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: ['everyday'],
        created_at: '2026-03-28T00:00:00.000Z',
      },
      {
        name: 'Curd',
        componentType: 'extra',
        extra_category_id: 3,
        extra_category: 'dairy',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: ['everyday'],
        created_at: '2026-03-28T00:00:00.000Z',
      },
    ]);
    const dispatch = vi.fn();

    const { rerender } = render(<RuleFields state={buildState()} dispatch={dispatch} />);

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByText('Curd (extra)'));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_REQUIRE_COMPONENT_IDS',
      component_ids: [2],
    });

    rerender(<RuleFields state={{ ...buildState(), require_component_ids: [2] }} dispatch={dispatch} />);

    expect(await screen.findByText('Curd (extra)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Curd' }));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_REQUIRE_COMPONENT_IDS',
      component_ids: [],
    });
  });
});
