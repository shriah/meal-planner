/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/client';
import { addCategory } from '@/services/category-db';
import type { DishLink } from '@/rules';
import type { ComponentType } from '@/types/component';
import { LinkList } from './LinkList';

afterEach(() => cleanup());

beforeEach(async () => {
  await db.categories.clear();
  await db.components.clear();
  await db.rules.clear();
});

/** A button once it can be used: the link buttons wait for the library lookup to load. */
async function readyButton(name: string, container: HTMLElement = document.body) {
  const button = await within(container).findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

const dish = (name: string, componentType: ComponentType) =>
  db.components.add({ name, componentType, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' }) as Promise<number>;

function Harness({ initial, componentType = 'curry', selfId, onChange }: {
  initial: DishLink[]; componentType?: ComponentType; selfId?: number; onChange?: (links: DishLink[]) => void
}) {
  const [links, setLinks] = useState(initial);
  return (
    <LinkList
      dishName="Sambar"
      componentType={componentType}
      selfId={selfId}
      links={links}
      onChange={(next) => { setLinks(next); onChange?.(next); }}
    />
  );
}

describe('LinkList', () => {
  it('shows each link as a sentence with edit and remove', async () => {
    const rice = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const onChange = vi.fn();
    render(<Harness initial={[
      { mode: 'with', target: 'base_category', values: [rice], strength: 'always' },
      { mode: 'never', target: 'curry_category', values: ['soup'], strength: 'sometimes' },
    ]} onChange={onChange} />);

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    await waitFor(() => expect(items[0]).toHaveTextContent('Sambar is always planned only with Rice Plates'));
    expect(items[1]).toHaveTextContent('Sambar is sometimes kept away from soup');
    expect(within(items[0]).getByRole('button', { name: 'Edit' })).toBeInTheDocument();

    await userEvent.click(await readyButton('Remove', items[1]));
    expect(onChange).toHaveBeenLastCalledWith([{ mode: 'with', target: 'base_category', values: [rice], strength: 'always' }]);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('warns beside a link that cannot work', async () => {
    const idli = await dish('Idli', 'base');
    await db.rules.add({ name: 'Idli: never planned automatically', spec: { template: 'exclude', params: { match: { field: 'id', value: idli }, strength: 'must' } }, owner_component_id: idli, enabled: true, created_at: '' } as never);
    render(<Harness initial={[{ mode: 'with', target: 'base_dish', values: [idli], strength: 'always' }]} />);
    const warning = await screen.findByText('None of Idli can be planned, so Sambar would never be planned.');
    expect(warning).toHaveClass('text-amber-700');
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
  });

  it('says a dish with no links goes with anything', async () => {
    render(<Harness initial={[]} />);
    expect(await screen.findByText('Goes with anything.')).toBeInTheDocument();
  });

  it('adds a link through the editor and hides slots already used', async () => {
    const rice = await addCategory({ kind: 'base', name: 'Rice Plates' });
    await addCategory({ kind: 'base', name: 'Flatbreads' });
    const onChange = vi.fn();
    render(<Harness initial={[
      { mode: 'with', target: 'curry_category', values: ['soup'], strength: 'always' },
      { mode: 'never', target: 'curry_category', values: ['stew'], strength: 'always' },
      { mode: 'with', target: 'extra_category', values: [], strength: 'always' },
    ]} componentType="extra" onChange={onChange} />);

    await userEvent.click(await readyButton('Add link'));
    const linkTo = screen.getByRole('combobox', { name: 'Link to' });
    const targets = within(linkTo).getAllByRole('option').map((o) => o.textContent);
    // Both curry type slots are used; extra categories still has "never with" free.
    expect(targets).not.toContain('Curry types');
    expect(targets).toContain('Extra categories');
    await userEvent.selectOptions(linkTo, 'Extra categories');
    expect(screen.queryByRole('button', { name: 'Only with' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Never with' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.selectOptions(linkTo, 'Base categories');
    await userEvent.click(screen.getByRole('button', { name: 'Only with' }));
    await userEvent.click(screen.getByRole('button', { name: 'Often' }));
    expect(screen.getByText(/tick at least one/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Rice Plates' }));
    expect(screen.getByText('Sambar is often planned only with Rice Plates')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([
      { mode: 'with', target: 'base_category', values: [rice], strength: 'moderately' },
    ]));
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
  });

  it('filters dish options by search and keeps ticks across searches', async () => {
    const self = await dish('Papad', 'extra');
    const ids: Record<string, number> = {};
    for (const name of ['Pickle', 'Raita', 'Rasam', 'Curd', 'Chips', 'Salad', 'Chutney', 'Payasam', 'Buttermilk']) ids[name] = await dish(name, 'extra');
    const onChange = vi.fn();
    // Specific extras are offered only where the dish already links to them.
    const stored: DishLink = { mode: 'with', target: 'extra_dish', values: [ids.Pickle], strength: 'always' };
    render(<Harness initial={[stored]} componentType="extra" selfId={self} onChange={onChange} />);

    await userEvent.click(await readyButton('Add link'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Link to' }), 'Specific extras');
    await userEvent.click(screen.getByRole('button', { name: 'Never with' }));
    // A dish is never offered itself.
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Pickle' })).toBeInTheDocument());
    expect(screen.queryByRole('checkbox', { name: 'Papad' })).not.toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: 'Search options' });
    await userEvent.type(search, 'RA');
    expect(screen.getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)).toEqual(['Raita', 'Rasam']);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Rasam' }));
    await userEvent.clear(search);
    await userEvent.type(search, 'chi');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Chips' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await userEvent.clear(search);
    expect(screen.getByRole('checkbox', { name: 'Rasam' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onChange).toHaveBeenLastCalledWith([
      stored,
      { mode: 'never', target: 'extra_dish', values: [ids.Rasam, ids.Chips], strength: 'always' },
    ]);
  });

  it('offers a new curry link served with first, and only the allowed targets', async () => {
    await addCategory({ kind: 'base', name: 'Rice Plates' });
    render(<Harness initial={[]} />);

    await userEvent.click(await readyButton('Add link'));
    const linkTo = screen.getByRole('combobox', { name: 'Link to' });
    expect(within(linkTo).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Base categories', 'Extra categories', 'Curry types', 'Specific bases',
    ]);
    expect(linkTo).toHaveValue('base_category');
    expect(screen.getByRole('button', { name: 'Served with' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Only with' })).toBeInTheDocument();
    await userEvent.selectOptions(linkTo, 'Curry types');
    expect(screen.queryByRole('button', { name: 'Only with' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Served with' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Never with' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers an extra the same, with no specific dishes', async () => {
    render(<Harness initial={[]} componentType="extra" />);

    await userEvent.click(await readyButton('Add link'));
    const linkTo = screen.getByRole('combobox', { name: 'Link to' });
    expect(within(linkTo).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Base categories', 'Extra categories', 'Curry types', 'Specific bases',
    ]);
    expect(screen.getByRole('button', { name: 'Served with' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps a stored only-with link on specific curries listed, editable and removable', async () => {
    const other = await dish('Kootu', 'curry');
    const onChange = vi.fn();
    render(<Harness initial={[{ mode: 'with', target: 'curry_dish', values: [other], strength: 'always' }]} componentType="extra" onChange={onChange} />);

    const item = await screen.findByRole('listitem');
    await waitFor(() => expect(item).toHaveTextContent('Sambar is always planned only with Kootu'));
    await userEvent.click(await readyButton('Edit', item));
    expect(screen.getByRole('combobox', { name: 'Link to' })).toHaveValue('curry_dish');
    expect(screen.getByRole('button', { name: 'Only with' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Sometimes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onChange).toHaveBeenLastCalledWith([{ mode: 'with', target: 'curry_dish', values: [other], strength: 'sometimes' }]);
    await userEvent.click(await readyButton('Remove'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('selects all and clears the options', async () => {
    await addCategory({ kind: 'base', name: 'Rice Plates' });
    await addCategory({ kind: 'base', name: 'Flatbreads' });
    render(<Harness initial={[]} />);

    await userEvent.click(await readyButton('Add link'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Link to' }), 'Base categories');
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('limits a link to days and meals', async () => {
    const onChange = vi.fn();
    render(<Harness initial={[]} onChange={onChange} />);

    await userEvent.click(await readyButton('Add link'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Link to' }), 'Curry types');
    await userEvent.click(screen.getByRole('button', { name: 'Never with' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'soup' }));
    expect(screen.queryByRole('checkbox', { name: 'Monday' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limit to days or meals' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Monday' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Breakfast' }));
    expect(screen.getByText('Sambar is always kept away from soup, on Mon at breakfast')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onChange).toHaveBeenLastCalledWith([
      { mode: 'never', target: 'curry_category', values: ['soup'], strength: 'always', scope: { days: ['monday'], meals: ['breakfast'] } },
    ]);
  });

  it('edits a link in place', async () => {
    const rice = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const bread = await addCategory({ kind: 'base', name: 'Flatbreads' });
    const onChange = vi.fn();
    render(<Harness initial={[
      { mode: 'never', target: 'curry_category', values: ['soup'], strength: 'always' },
      { mode: 'with', target: 'base_category', values: [rice], strength: 'usually', scope: { days: ['monday'] } },
    ]} onChange={onChange} />);

    const [, second] = await screen.findAllByRole('listitem');
    await userEvent.click(await readyButton('Edit', second));
    // The link's own slot is offered, and the editor starts from the link.
    expect(screen.getByRole('combobox', { name: 'Link to' })).toHaveValue('base_category');
    expect(screen.getByRole('button', { name: 'Usually' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Add link' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Flatbreads' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onChange).toHaveBeenLastCalledWith([
      { mode: 'never', target: 'curry_category', values: ['soup'], strength: 'always' },
      { mode: 'with', target: 'base_category', values: [rice, bread], strength: 'usually', scope: { days: ['monday'] } },
    ]);
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Sambar is usually planned only with Rice Plates or Flatbreads, on Mon');
  });

  it('cancels an edit without changing the link', async () => {
    const onChange = vi.fn();
    render(<Harness initial={[{ mode: 'never', target: 'curry_category', values: ['soup'], strength: 'always' }]} onChange={onChange} />);

    await userEvent.click(await readyButton('Edit'));
    await userEvent.click(screen.getByRole('checkbox', { name: 'stew' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listitem')).toHaveTextContent('Sambar is always kept away from soup');
  });
});
