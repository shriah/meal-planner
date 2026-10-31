/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { useLiveQuery } from 'dexie-react-hooks';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/client';
import { addCategory, deleteCategory, renameCategory } from '@/services/category-db';
import { dayRule, exclusionRule, linkRule, pairingRule } from '@/rules';
import * as foodDb from '@/services/food-db';
import { saveComponent } from '@/services/food-db';
import { ComponentRow } from './ComponentRow';
import { ComponentTab } from './ComponentTab';

/** Compatible bases are stored as a pairing rule the curry owns. */
const addPairing = (id: number, name: string, baseCategories: number[]) =>
  db.rules.add({ ...pairingRule({ id, name }, baseCategories), enabled: true, created_at: '' });

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  await db.categories.clear();
  await db.components.clear();
  await db.rules.clear();
});

describe('ComponentRow curry compatibility summary', () => {
  it('shows only the extra-category summary for extra rows', async () => {
    const liquidId = await addCategory({ kind: 'extra', name: 'Liquid' });
    await addCategory({ kind: 'base', name: 'Rice Plates' });

    render(
      <ComponentRow
        component={{
          id: 1,
          name: 'Rasam',
          componentType: 'extra',
          extra_category_id: liquidId,
          dietary_tags: ['veg'],
          regional_tags: ['south-indian'],
          occasion_tags: [],
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

    expect(await screen.findByText('Liquid')).toBeInTheDocument();
    expect(screen.queryByText('Rice Plates')).toBeNull();
  });

  it('shows collapsed compatible base labels for curry rows', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const breadId = await addCategory({ kind: 'base', name: 'Flatbreads' });

    await addPairing(1, 'Sambar', [riceId, breadId]);
    render(
      <ComponentRow
        component={{
          id: 1,
          name: 'Sambar',
          componentType: 'curry',
          dietary_tags: ['veg'],
          regional_tags: ['south-indian'],
          occasion_tags: [],
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

    await addPairing(1, 'Sambar', [riceId]);
    render(
      <ComponentRow
        component={{
          id: 1,
          name: 'Sambar',
          componentType: 'curry',
          dietary_tags: ['veg'],
          regional_tags: ['south-indian'],
          occasion_tags: [],
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

  it('shows a warning badge for a dish that is never planned automatically, and its days', async () => {
    await db.rules.bulkAdd([
      { ...exclusionRule({ id: 1, name: 'Tomato Curry' }), enabled: true, created_at: '' },
      { ...dayRule({ id: 1, name: 'Tomato Curry' }, ['saturday', 'sunday']), enabled: true, created_at: '' },
    ]);

    render(
      <ComponentRow
        component={{
          id: 1,
          name: 'Tomato Curry',
          componentType: 'curry',
          dietary_tags: ['veg'],
          regional_tags: ['south-indian'],
          occasion_tags: [],
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
    expect(screen.getByText('Weekends')).toBeInTheDocument();
  });

  it('shows no summary or warning for a curry without a pairing, which goes with any base', async () => {
    await addCategory({ kind: 'base', name: 'Rice Plates' });

    render(
      <ComponentRow
        component={{
          id: 1,
          name: 'Any Base Curry',
          componentType: 'curry',
          dietary_tags: ['veg'],
          regional_tags: ['south-indian'],
          occasion_tags: [],
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

    expect(await screen.findByText('Any Base Curry')).toBeInTheDocument();
    expect(screen.queryByText(/not auto-selected/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Rice Plates')).not.toBeInTheDocument();
  });

  it('drops the category summary when its last base category is deleted', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const curryId = await saveComponent(undefined, {
      name: 'Tomato Curry',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: [],
      created_at: new Date().toISOString(),
    }, { 'with:base_category': (c) => pairingRule(c, [riceId]) });

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
      expect(screen.queryByText('Rice Plates')).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/not auto-selected/i)).not.toBeInTheDocument();
  });

  it.each([
    ['frequent', 'Frequent'],
    ['rare', 'Rare'],
  ] as const)('shows a %s dish with a "%s" badge, and no badge for normal', async (frequency, label) => {
    const base = {
      id: 1, name: 'Dal', componentType: 'curry' as const, dietary_tags: ['veg' as const], regional_tags: [],
      occasion_tags: [], created_at: new Date().toISOString(),
    };
    const handlers = { expanded: false, confirmingDelete: false, onExpand: () => {}, onCollapse: () => {}, onRequestDelete: () => {}, onCancelDelete: () => {}, onDelete: () => {} };
    const { rerender } = render(<ComponentRow component={{ ...base, frequency }} {...handlers} />);
    expect(await screen.findByText(label)).toBeInTheDocument();

    rerender(<ComponentRow component={{ ...base, frequency: 'normal' }} {...handlers} />);
    await waitFor(() => expect(screen.queryByText(label)).not.toBeInTheDocument());
  });
});

describe('ComponentTab library lookup', () => {
  it('renders 25 rows from one lookup', async () => {
    const dish = (name: string, componentType: 'base' | 'curry') =>
      ({ name, componentType, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' });
    const idliId = (await db.components.add(dish('Idli', 'base'))) as number;
    for (let i = 1; i <= 30; i++) {
      const id = (await db.components.add(dish(`Curry ${String(i).padStart(2, '0')}`, 'curry'))) as number;
      if (i === 1) {
        await db.rules.add({ ...linkRule({ id, name: `Curry 01` }, { mode: 'with', target: 'base_dish', values: [idliId] }), enabled: true, created_at: '' });
      }
    }
    const spy = vi.spyOn(foodDb, 'getAllComponents');
    render(<ComponentTab type="curry" label="Curries" />);

    expect(await screen.findByText('Only with Idli')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Delete Curry/ })).toHaveLength(25);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
