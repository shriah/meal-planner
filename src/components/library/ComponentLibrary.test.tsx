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
