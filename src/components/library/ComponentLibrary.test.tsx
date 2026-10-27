/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/client';
import { ComponentLibrary } from './ComponentLibrary';

const scrollIntoView = vi.fn();

beforeEach(async () => {
  Element.prototype.scrollIntoView = scrollIntoView;
  scrollIntoView.mockClear();
  await Promise.all([db.components.clear(), db.categories.clear(), db.rules.clear()]);
});
afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const dish = (name: string, componentType: 'base' | 'curry') =>
  ({ name, componentType, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' });

describe('ComponentLibrary deep link', () => {
  it('opens the tab of the dish named in the URL hash and expands it', async () => {
    await db.components.add(dish('Plain Rice', 'base'));
    const sambarId = (await db.components.add(dish('Sambar', 'curry'))) as number;
    window.location.hash = `#dish-${sambarId}`;

    render(<ComponentLibrary />);

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Curries' })).toHaveAttribute('aria-selected', 'true'));
    expect(await screen.findByRole('button', { name: 'Save Curry' })).toBeInTheDocument();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(document.getElementById(`dish-${sambarId}`)).toBeInTheDocument();
  });

  it('lets the user move to another tab after a deep link', async () => {
    const sambarId = (await db.components.add(dish('Sambar', 'curry'))) as number;
    window.location.hash = `#dish-${sambarId}`;
    render(<ComponentLibrary />);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Curries' })).toHaveAttribute('aria-selected', 'true'));

    await userEvent.click(screen.getByRole('tab', { name: 'Bases' }));

    expect(screen.getByRole('tab', { name: 'Bases' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the first tab for a dish that no longer exists, or no hash', async () => {
    window.location.hash = '#dish-404';
    render(<ComponentLibrary />);
    expect(screen.getByRole('tab', { name: 'Bases' })).toHaveAttribute('aria-selected', 'true');
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('stays on the tab, with its search and filters, when the dish that was linked to is deleted', async () => {
    const sambarId = (await db.components.add(dish('Sambar', 'curry'))) as number;
    window.location.hash = `#dish-${sambarId}`;
    render(<ComponentLibrary />);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Curries' })).toHaveAttribute('aria-selected', 'true'));
    await userEvent.type(screen.getByRole('searchbox'), 'sam');

    await db.components.delete(sambarId);

    await waitFor(() => expect(screen.queryByText('Sambar')).not.toBeInTheDocument());
    expect(screen.getByRole('tab', { name: 'Curries' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('searchbox')).toHaveValue('sam');
  });
});

describe('ComponentLibrary paging and meal filter', () => {
  const addBases = async (n: number) => {
    for (let i = 1; i <= n; i++) await db.components.add(dish(`Dish ${String(i).padStart(2, '0')}`, 'base'));
  };

  it('shows 25 dishes a page and moves between pages', async () => {
    await addBases(30);
    render(<ComponentLibrary />);

    expect(await screen.findByText('Dish 01')).toBeInTheDocument();
    expect(screen.getByText('Showing 1–25 of 30')).toBeInTheDocument();
    expect(screen.queryByText('Dish 26')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Dish 26')).toBeInTheDocument();
    expect(screen.queryByText('Dish 01')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 26–30 of 30')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('has no pager when everything fits, and goes back to page 1 when the search changes', async () => {
    await addBases(30);
    render(<ComponentLibrary />);
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));

    await userEvent.type(screen.getByRole('searchbox'), 'Dish 0');

    expect(screen.getByText('Dish 01')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  it('opens on the page of a deep-linked dish', async () => {
    await addBases(30);
    const last = (await db.components.toArray()).find((c) => c.name === 'Dish 30')!;
    window.location.hash = `#dish-${last.id}`;
    render(<ComponentLibrary />);

    expect(await screen.findByText('Showing 26–30 of 30')).toBeInTheDocument();
    expect(document.getElementById(`dish-${last.id}`)).toBeInTheDocument();
  });

  it('filters by the meal a dish may be planned at, counting rules for its category or tags too', async () => {
    const poori = (await db.components.add(dish('Poori', 'base'))) as number;
    await db.components.add(dish('Rice', 'base'));
    const idli = (await db.components.add(dish('Idli', 'base'))) as number;
    const stored = (r: object) => ({ enabled: true, created_at: '', ...r }) as never;
    await db.rules.bulkAdd([
      stored({ name: 'Poori breakfast', spec: { template: 'allowed_meals', params: { match: { field: 'id', op: 'eq', value: poori }, meals: ['breakfast'], strength: 'must' } } }),
      stored({ name: 'Idli not at dinner', owner_component_id: idli, spec: { template: 'allowed_meals', params: { match: { field: 'id', op: 'eq', value: idli }, meals: ['breakfast', 'lunch'], strength: 'must' } } }),
    ]);
    render(<ComponentLibrary />);
    await screen.findByText('Poori');

    await userEvent.click(screen.getByRole('button', { name: 'dinner' }));
    expect(screen.getByText('Rice')).toBeInTheDocument();
    expect(screen.queryByText('Poori')).not.toBeInTheDocument();
    expect(screen.queryByText('Idli')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'dinner' }));
    await userEvent.click(screen.getByRole('button', { name: 'breakfast' }));
    expect(screen.getByText('Poori')).toBeInTheDocument();
    expect(screen.getByText('Idli')).toBeInTheDocument();
  });
});
