/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Toaster } from 'sonner';
import { db } from '@/db/client';
import { addCategory, getCategoriesByKind } from '@/services/category-db';
import { ComponentLibrary } from './ComponentLibrary';

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  await db.categories.clear();
  await db.components.clear();
  await db.rules.clear();
});

async function seedCategories() {
  const riceId = await addCategory({ kind: 'base', name: 'Rice-based' });
  await addCategory({ kind: 'base', name: 'Bread-based' });
  await addCategory({ kind: 'extra', name: 'Liquid' });
  await addCategory({ kind: 'extra', name: 'Crunchy' });

  await db.components.add({
    name: 'Rasam',
    componentType: 'extra',
    extra_category_id: 3,
    extra_category: 'liquid',
    compatible_base_category_ids: [riceId],
    compatible_base_types: ['rice-based'],
    dietary_tags: ['veg'],
    regional_tags: ['south-indian'],
    occasion_tags: ['everyday'],
    created_at: new Date().toISOString(),
  });
}

describe('CategoryManager', () => {
  it('exposes Manage Categories from the library header and shows both category kinds in the sheet', async () => {
    await seedCategories();

    render(
      <>
        <ComponentLibrary />
        <Toaster />
      </>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Manage Categories' }));

    expect(await screen.findByRole('heading', { name: 'Manage Categories' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Base Categories' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: 'Extra Categories' })).toBeInTheDocument();
    expect(screen.getByText('Use base categories to group staples for components, rules, and generator matching.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Extra Categories' }));

    expect(screen.getByRole('tab', { name: 'Extra Categories' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Use extra categories to organize accompaniments and rule requirements.')).toBeInTheDocument();
  });

  it('supports inline add and rename flows with Add Category, Save Name, and Stop Renaming', async () => {
    await seedCategories();

    render(
      <>
        <ComponentLibrary />
        <Toaster />
      </>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Manage Categories' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Add Category' }));

    const addInput = screen.getByLabelText('New base category name');
    const addSave = screen.getByRole('button', { name: 'Add Category' });
    expect(addSave).toBeDisabled();

    await userEvent.type(addInput, 'Rice-based');
    expect(screen.getByText('Enter a unique category name.')).toBeInTheDocument();
    expect(addSave).toBeDisabled();

    await userEvent.clear(addInput);
    await userEvent.type(addInput, 'Millet-based');
    await userEvent.click(addSave);

    await waitFor(async () => {
      const baseCategories = await getCategoriesByKind('base');
      expect(baseCategories.map((category) => category.name)).toContain('Millet-based');
    });

    const milletRow = screen.getByRole('listitem', { name: 'Millet-based' });
    await userEvent.click(within(milletRow).getByRole('button', { name: 'Rename Category' }));

    const renameInput = within(milletRow).getByLabelText('Rename Millet-based');
    await userEvent.clear(renameInput);
    await userEvent.type(renameInput, 'Flatbread-based');
    await userEvent.click(within(milletRow).getByRole('button', { name: 'Save Name' }));

    await waitFor(async () => {
      const baseCategories = await getCategoriesByKind('base');
      expect(baseCategories.map((category) => category.name)).toContain('Flatbread-based');
    });

    const breadRow = screen.getByRole('listitem', { name: 'Bread-based' });
    await userEvent.click(within(breadRow).getByRole('button', { name: 'Rename Category' }));
    expect(within(breadRow).getByRole('button', { name: 'Stop Renaming' })).toBeInTheDocument();
  });

  it('routes delete through destructive confirmation that says cleanup is automatic', async () => {
    await seedCategories();

    render(
      <>
        <ComponentLibrary />
        <Toaster />
      </>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Manage Categories' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Extra Categories' }));

    const liquidRow = await screen.findByRole('listitem', { name: 'Liquid' });
    await userEvent.click(within(liquidRow).getByRole('button', { name: 'Delete Category' }));

    expect(screen.getByText('Delete category: Delete “Liquid”? Components and rules that use it will be cleaned up automatically.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete Liquid cleanup is automatic' }));

    await waitFor(async () => {
      const extraCategories = await getCategoriesByKind('extra');
      expect(extraCategories.map((category) => category.name)).not.toContain('Liquid');
    });
  });

  it('renders loading placeholders and the empty-state copy required by the UI spec', async () => {
    render(
      <>
        <ComponentLibrary />
        <Toaster />
      </>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Manage Categories' }));

    expect(await screen.findByRole('heading', { name: 'Manage Categories' })).toBeInTheDocument();
    expect(screen.getByText('No categories yet')).toBeInTheDocument();
    expect(screen.getByText('Add a category to make it available in components, rules, and generator matching.')).toBeInTheDocument();
  });
});
