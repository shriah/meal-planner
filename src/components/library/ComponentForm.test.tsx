/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLiveQuery } from 'dexie-react-hooks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { addCategory, deleteCategory, renameCategory } from '@/services/category-db';
import { getComponentsByType } from '@/services/food-db';
import { ComponentForm } from './ComponentForm';
import { ComponentRow } from './ComponentRow';

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  await db.categories.clear();
  await db.components.clear();
  await db.rules.clear();
});

function LiveComponentRow({ componentId }: { componentId: number }) {
  const component = useLiveQuery(() => db.components.get(componentId), [componentId], undefined);

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

function LiveEditForm({ componentId }: { componentId: number }) {
  const component = useLiveQuery(() => db.components.get(componentId), [componentId], undefined);

  if (!component) {
    return null;
  }

  return (
    <ComponentForm
      component={component}
      componentType={component.componentType}
      mode="edit"
      onSave={() => {}}
      onDiscard={() => {}}
    />
  );
}

describe('ComponentForm dynamic category wiring', () => {
  it('uses live base-category records instead of hard-coded base types when creating a base component', async () => {
    const steamedId = await addCategory({ kind: 'base', name: 'Steamed' });
    await addCategory({ kind: 'base', name: 'Flatbread' });

    render(
      <ComponentForm
        componentType="base"
        mode="add"
        onSave={() => {}}
        onDiscard={() => {}}
      />,
    );

    await userEvent.click(await screen.findByRole('combobox', { name: 'Base Category' }));

    expect(screen.getByRole('option', { name: 'Steamed' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Flatbread' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Rice-based' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('option', { name: 'Steamed' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Idli');
    await userEvent.click(screen.getByRole('button', { name: 'Save Base' }));

    await waitFor(async () => {
      const bases = await getComponentsByType('base');
      expect(bases).toHaveLength(1);
      expect(bases[0].base_category_id).toBe(steamedId);
    });
  });

  it('uses live extra categories without any compatible-base checklist, persisting only the extra category id on save', async () => {
    const liquidId = await addCategory({ kind: 'extra', name: 'Brothy' });
    await addCategory({ kind: 'extra', name: 'Crunchy' });

    render(
      <ComponentForm
        componentType="extra"
        mode="add"
        onSave={() => {}}
        onDiscard={() => {}}
      />,
    );

    expect(screen.queryByText('Compatible Base Categories')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Extra Category' }));
    await userEvent.click(screen.getByRole('option', { name: 'Brothy' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Rasam');
    await userEvent.click(screen.getByRole('button', { name: 'Save Extra' }));

    await waitFor(async () => {
      const extras = await getComponentsByType('extra');
      expect(extras).toHaveLength(1);
      expect(extras[0].extra_category_id).toBe(liquidId);
      expect(extras[0]).not.toHaveProperty('compatible_base_category_ids');
      expect(extras[0]).not.toHaveProperty('compatible_base_types');
    });
  });

  it('reuses the compatible-base checklist when creating a curry and persists selected base category ids', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const breadId = await addCategory({ kind: 'base', name: 'Flatbreads' });

    render(
      <ComponentForm
        componentType="curry"
        mode="add"
        onSave={() => {}}
        onDiscard={() => {}}
      />,
    );

    expect(await screen.findByText('Compatible Base Categories')).toBeInTheDocument();
    expect(await screen.findByText('Rice Plates')).toBeInTheDocument();
    expect(await screen.findByText('Flatbreads')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Rice Plates'));
    await userEvent.type(screen.getByLabelText('Name'), 'Sambar');
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(async () => {
      const curries = await getComponentsByType('curry');
      expect(curries).toHaveLength(1);
      expect(curries[0].compatible_base_category_ids).toEqual([riceId]);
    });
  });

  it('keeps zero-compatible curries editable, persists an empty array, and shows a warning that they will not be auto-selected', async () => {
    await addCategory({ kind: 'base', name: 'Rice Plates' });

    render(
      <ComponentForm
        componentType="curry"
        mode="add"
        onSave={() => {}}
        onDiscard={() => {}}
      />,
    );

    expect(await screen.findByText(/will not be auto-selected/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Name'), 'Plain Tomato Curry');
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(async () => {
      const curries = await getComponentsByType('curry');
      expect(curries).toHaveLength(1);
      expect(curries[0].compatible_base_category_ids).toEqual([]);
    });
  });

  it('refreshes form and row labels after a category rename without rewriting stored references', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice-based' });
    const liquidId = await addCategory({ kind: 'extra', name: 'Liquid' });
    const extraId = await db.components.add({
      name: 'Rasam',
      componentType: 'extra',
      extra_category_id: liquidId,
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: new Date().toISOString(),
    });

    render(
      <>
        <LiveEditForm componentId={extraId} />
        <LiveComponentRow componentId={extraId} />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Extra Category' })).toHaveTextContent('Liquid');
    });

    await renameCategory(liquidId, 'Brothy');

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Extra Category' })).toHaveTextContent('Brothy');
    });

    const [storedExtra] = await getComponentsByType('extra');
    expect(storedExtra.extra_category_id).toBe(liquidId);
    expect(storedExtra).not.toHaveProperty('compatible_base_category_ids');
    expect(storedExtra).not.toHaveProperty('compatible_base_types');
  });

  it('refreshes curry checklist labels after a base-category rename without rewriting stored ids', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice-based' });
    const breadId = await addCategory({ kind: 'base', name: 'Flatbreads' });
    const curryId = await db.components.add({
      name: 'Sambar',
      componentType: 'curry',
      compatible_base_category_ids: [riceId],
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: new Date().toISOString(),
    });

    render(
      <>
        <LiveEditForm componentId={curryId} />
        <LiveComponentRow componentId={curryId} />
      </>,
    );

    expect(await screen.findAllByText('Rice-based')).not.toHaveLength(0);
    expect(screen.getByText('Flatbreads')).toBeInTheDocument();

    await renameCategory(riceId, 'Steamed rice');
    await renameCategory(breadId, 'Rotis');

    await waitFor(() => {
      expect(screen.getAllByText('Steamed rice').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Rotis')).toBeInTheDocument();

    const [storedCurry] = await getComponentsByType('curry');
    expect(storedCurry.compatible_base_category_ids).toEqual([riceId]);
  });

  it('keeps curry edit state aligned when category delete normalization removes its last compatible base', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice-based' });
    const curryId = await db.components.add({
      name: 'Sambar',
      componentType: 'curry',
      compatible_base_category_ids: [riceId],
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: new Date().toISOString(),
    });

    render(<LiveEditForm componentId={curryId} />);

    expect(await screen.findByText('Rice-based')).toBeInTheDocument();
    expect(screen.queryByText(/will not be auto-selected/i)).not.toBeInTheDocument();

    await deleteCategory(riceId);

    await waitFor(() => {
      expect(screen.getByText(/will not be auto-selected/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Rice-based')).not.toBeInTheDocument();

    const [storedCurry] = await getComponentsByType('curry');
    expect(storedCurry.compatible_base_category_ids).toEqual([]);
  });
});
