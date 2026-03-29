/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { addCategory, renameCategory } from '@/services/category-db';
import { ComponentRow } from './ComponentRow';

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  await db.categories.clear();
  await db.components.clear();
  await db.rules.clear();
});

describe('ComponentRow curry compatibility summary', () => {
  it('shows collapsed compatible base labels for curry rows', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const breadId = await addCategory({ kind: 'base', name: 'Flatbreads' });

    render(
      <ComponentRow
        component={{
          id: 1,
          name: 'Sambar',
          componentType: 'curry',
          compatible_base_category_ids: [riceId, breadId],
          dietary_tags: ['veg'],
          regional_tags: ['south-indian'],
          occasion_tags: ['everyday'],
          created_at: new Date().toISOString(),
        }}
        expanded={false}
        confirmingDelete={false}
        onExpand={() => {}}
        onCollapse={() => {}}
        onRequestDelete={() => {}}
        onCancelDelete={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(await screen.findByText('Rice Plates, Flatbreads')).toBeInTheDocument();
  });

  it('resolves curry summary labels from live category records after rename', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });

    render(
      <ComponentRow
        component={{
          id: 1,
          name: 'Sambar',
          componentType: 'curry',
          compatible_base_category_ids: [riceId],
          dietary_tags: ['veg'],
          regional_tags: ['south-indian'],
          occasion_tags: ['everyday'],
          created_at: new Date().toISOString(),
        }}
        expanded={false}
        confirmingDelete={false}
        onExpand={() => {}}
        onCollapse={() => {}}
        onRequestDelete={() => {}}
        onCancelDelete={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(await screen.findByText('Rice Plates')).toBeInTheDocument();

    await renameCategory(riceId, 'Steamed rice');

    await waitFor(() => {
      expect(screen.getByText('Steamed rice')).toBeInTheDocument();
    });
  });

  it('shows an explicit warning badge for zero-compatible curries', async () => {
    await addCategory({ kind: 'base', name: 'Rice Plates' });

    render(
      <ComponentRow
        component={{
          id: 1,
          name: 'Tomato Curry',
          componentType: 'curry',
          compatible_base_category_ids: [],
          dietary_tags: ['veg'],
          regional_tags: ['south-indian'],
          occasion_tags: ['everyday'],
          created_at: new Date().toISOString(),
        }}
        expanded={false}
        confirmingDelete={false}
        onExpand={() => {}}
        onCollapse={() => {}}
        onRequestDelete={() => {}}
        onCancelDelete={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(await screen.findByText(/not auto-selected/i)).toBeInTheDocument();
  });
});
