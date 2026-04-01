/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { useLiveQuery } from 'dexie-react-hooks';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { addCategory, deleteCategory, renameCategory } from '@/services/category-db';
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

  it('switches from a category summary to the zero-compatible warning after delete normalization', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const curryId = await db.components.add({
      name: 'Tomato Curry',
      componentType: 'curry',
      compatible_base_category_ids: [riceId],
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: new Date().toISOString(),
    });

    function LiveRow() {
      const component = useLiveQuery(() => db.components.get(curryId), [curryId], undefined);

      if (!component) {
        return null;
      }

      return (
        <ComponentRow
          component={component}
          expanded={false}
          confirmingDelete={false}
          onExpand={() => {}}
          onCollapse={() => {}}
          onRequestDelete={() => {}}
          onCancelDelete={() => {}}
          onDelete={() => {}}
        />
      );
    }

    render(<LiveRow />);

    expect(await screen.findByText('Rice Plates')).toBeInTheDocument();

    await deleteCategory(riceId);

    await waitFor(() => {
      expect(screen.getByText(/not auto-selected/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Rice Plates')).not.toBeInTheDocument();
  });
});
