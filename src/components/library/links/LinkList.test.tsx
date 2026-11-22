/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/client';
import { legacyPartIds, type LegacyParts } from '@/db/parts';
import { ensurePartsAndTagGroups } from '@/db/parts-store';
import { addCategory } from '@/services/category-db';
import { capRules, type DishLink, type LinkKind, type RuleRecord } from '@/rules';
import type { ComponentType } from '@/types/component';
import { LinkList } from './LinkList';
import { LibraryLookupProvider, useLibraryLookup } from '../LibraryLookup';
import { sameLink } from '@/rules';

afterEach(() => cleanup());

// The converted part of each type, as stored; a target names a part and whether it lists dishes or categories.
let P: LegacyParts;
const to = (type: ComponentType, kind: LinkKind) => ({ part: P[type], kind });
/** The "Link to" value of a target. */
const targetValue = (type: ComponentType, kind: LinkKind) => `${P[type]}:${kind}`;
/** A curry type: a category of the Curry part. */
const curryType = (name: string) => addCategory({ kind: 'curry', name });

beforeEach(async () => {
  // The app creates the parts at start, and a converted library caps the curry and the subzi at one per meal.
  const { parts } = await ensurePartsAndTagGroups();
  P = legacyPartIds(parts);
  await db.categories.clear();
  await db.components.clear();
  await db.rules.clear();
  await db.rules.bulkAdd(capRules(parts).map((r) => ({ ...r, enabled: true, created_at: '' })) as RuleRecord[]);
});

/** A button once it can be used: the link buttons wait for the library lookup to load. */
async function readyButton(name: string, container: HTMLElement = document.body) {
  const button = await within(container).findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

const dish = (name: string, componentType: ComponentType) =>
  db.components.add({ name, componentType, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' }) as Promise<number>;

function Harness({ initial, componentType = 'curry', selfId, offRuleIds, onChange }: {
  initial: DishLink[]; componentType?: ComponentType; selfId?: number; offRuleIds?: number[]; onChange?: (links: DishLink[]) => void
}) {
  const [links, setLinks] = useState(initial);
  return (
    <LinkList
      dishName="Sambar"
      componentType={componentType}
      selfId={selfId}
      links={links}
      offRuleIds={offRuleIds}
      onChange={(next) => { setLinks(next); onChange?.(next); }}
    />
  );
}

describe('LinkList', () => {
  it('shows each link as a sentence with edit and remove', async () => {
    const rice = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const soup = await curryType('soup');
    const onChange = vi.fn();
    render(<Harness initial={[
      { mode: 'with', target: to('base', 'category'), values: [rice], strength: 'always' },
      { mode: 'never', target: to('curry', 'category'), values: [soup], strength: 'sometimes' },
    ]} onChange={onChange} />);

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    await waitFor(() => expect(items[0]).toHaveTextContent('Sambar is always planned only with Rice Plates'));
    expect(items[1]).toHaveTextContent('Sambar is sometimes kept away from soup');
    expect(within(items[0]).getByRole('button', { name: 'Edit' })).toBeInTheDocument();

    await userEvent.click(await readyButton('Remove', items[1]));
    expect(onChange).toHaveBeenLastCalledWith([{ mode: 'with', target: to('base', 'category'), values: [rice], strength: 'always' }]);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('warns beside a link that cannot work', async () => {
    const idli = await dish('Idli', 'base');
    await db.rules.add({ name: 'Idli: never planned automatically', spec: { template: 'exclude', params: { match: { field: 'id', value: idli }, strength: 'must' } }, owner_component_id: idli, enabled: true, created_at: '' } as never);
    render(<Harness initial={[{ mode: 'with', target: to('base', 'dish'), values: [idli], strength: 'always' }]} />);
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
    await addCategory({ kind: 'extra', name: 'Liquid' });
    const onChange = vi.fn();
    render(<Harness initial={[
      { mode: 'with', target: to('curry', 'category'), values: [await curryType('soup')], strength: 'always' },
      { mode: 'never', target: to('curry', 'category'), values: [await curryType('stew')], strength: 'always' },
      { mode: 'with', target: to('extra', 'category'), values: [], strength: 'always' },
    ]} componentType="extra" onChange={onChange} />);

    await userEvent.click(await readyButton('Add link'));
    const linkTo = screen.getByRole('combobox', { name: 'Link to' });
    const targets = within(linkTo).getAllByRole('option').map((o) => o.textContent);
    // Never with is used for curry types; a dish may come with several sides, so Comes with is still offered.
    expect(targets).toContain('Curry types');
    await userEvent.selectOptions(linkTo, 'Curry types');
    expect(within(screen.getByRole('group', { name: 'Mode' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Comes with']);
    await userEvent.selectOptions(linkTo, 'Extra categories');
    expect(screen.queryByRole('button', { name: 'Only with' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comes with' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Never with' })).toBeInTheDocument();

    await userEvent.selectOptions(linkTo, 'Base categories');
    await userEvent.click(screen.getByRole('button', { name: 'Only with' }));
    await userEvent.click(screen.getByRole('button', { name: 'Often' }));
    expect(screen.getByText(/tick at least one/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Rice Plates' }));
    expect(screen.getByText('Sambar is often planned only with Rice Plates')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([
      { mode: 'with', target: to('base', 'category'), values: [rice], strength: 'moderately' },
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
    const stored: DishLink = { mode: 'with', target: to('extra', 'dish'), values: [ids.Pickle], strength: 'always' };
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
      { mode: 'never', target: to('extra', 'dish'), values: [ids.Rasam, ids.Chips], strength: 'always' },
    ]);
  });

  it('offers a new curry link served with first, and every target it may link to', async () => {
    await addCategory({ kind: 'base', name: 'Rice Plates' });
    await addCategory({ kind: 'extra', name: 'Liquid' });
    await curryType('soup');
    render(<Harness initial={[]} />);

    await userEvent.click(await readyButton('Add link'));
    const linkTo = screen.getByRole('combobox', { name: 'Link to' });
    // Each part's categories, then each part's dishes, in part order; not its own part, which holds one curry.
    expect(within(linkTo).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Base categories', 'Extra categories', 'Specific bases', 'Specific subzis', 'Specific extras',
    ]);
    expect(linkTo).toHaveValue(targetValue('base', 'category'));
    expect(screen.getByRole('button', { name: 'Served with' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Only with' })).toBeInTheDocument();
    await userEvent.selectOptions(linkTo, 'Specific extras');
    // A side is brought along rather than limited to.
    expect(screen.queryByRole('button', { name: 'Served with' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Only with' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comes with' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Never with' })).toBeInTheDocument();
  });

  it('offers an extra specific curries, subzis and extras', async () => {
    await addCategory({ kind: 'base', name: 'Rice Plates' });
    await addCategory({ kind: 'extra', name: 'Liquid' });
    await curryType('soup');
    render(<Harness initial={[]} componentType="extra" />);

    await userEvent.click(await readyButton('Add link'));
    const linkTo = screen.getByRole('combobox', { name: 'Link to' });
    expect(within(linkTo).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Base categories', 'Curry types', 'Extra categories', 'Specific bases', 'Specific curries', 'Specific subzis', 'Specific extras',
    ]);
    expect(screen.getByRole('button', { name: 'Served with' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps a stored only-with link on specific curries listed with a note, and opens it as comes with', async () => {
    const other = await dish('Kootu', 'curry');
    const onChange = vi.fn();
    render(<Harness initial={[{ mode: 'with', target: to('curry', 'dish'), values: [other], strength: 'always', ruleId: 7 }]} componentType="extra" onChange={onChange} />);

    const item = await screen.findByRole('listitem');
    await waitFor(() => expect(item).toHaveTextContent('Sambar is always planned only with Kootu (only limits: edit it to have it come with the meal)'));
    await userEvent.click(await readyButton('Edit', item));
    expect(screen.getByRole('combobox', { name: 'Link to' })).toHaveValue(targetValue('curry', 'dish'));
    expect(screen.getByRole('button', { name: 'Comes with' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Only with' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sometimes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    // Curries are above extras, so the extra is added when the curry is in the meal.
    expect(onChange).toHaveBeenLastCalledWith([{ mode: 'serve', target: to('curry', 'dish'), values: [other], strength: 'sometimes', ruleId: 7 }]);
    expect(screen.getByRole('listitem')).not.toHaveTextContent('only limits');
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
    const soup = await curryType('soup');
    const onChange = vi.fn();
    // An extra may keep away from curry types; a curry is not offered its own.
    render(<Harness initial={[]} componentType="extra" onChange={onChange} />);

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
      { mode: 'never', target: to('curry', 'category'), values: [soup], strength: 'always', scope: { days: ['monday'], meals: ['breakfast'] } },
    ]);
  });

  it('edits a link in place', async () => {
    const rice = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const bread = await addCategory({ kind: 'base', name: 'Flatbreads' });
    const soup = await curryType('soup');
    const onChange = vi.fn();
    render(<Harness initial={[
      { mode: 'never', target: to('curry', 'category'), values: [soup], strength: 'always' },
      { mode: 'with', target: to('base', 'category'), values: [rice], strength: 'usually', scope: { days: ['monday'] } },
    ]} onChange={onChange} />);

    const [, second] = await screen.findAllByRole('listitem');
    await userEvent.click(await readyButton('Edit', second));
    // The link's own slot is offered, and the editor starts from the link.
    expect(screen.getByRole('combobox', { name: 'Link to' })).toHaveValue(targetValue('base', 'category'));
    expect(screen.getByRole('button', { name: 'Usually' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Add link' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Flatbreads' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onChange).toHaveBeenLastCalledWith([
      { mode: 'never', target: to('curry', 'category'), values: [soup], strength: 'always' },
      { mode: 'with', target: to('base', 'category'), values: [rice, bread], strength: 'usually', scope: { days: ['monday'] } },
    ]);
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Sambar is usually planned only with Rice Plates or Flatbreads, on Mon');
  });

  it('cancels an edit without changing the link', async () => {
    const soup = await curryType('soup');
    await curryType('stew');
    const onChange = vi.fn();
    render(<Harness initial={[{ mode: 'never', target: to('curry', 'category'), values: [soup], strength: 'always' }]} onChange={onChange} />);

    await userEvent.click(await readyButton('Edit'));
    await userEvent.click(screen.getByRole('checkbox', { name: 'stew' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listitem')).toHaveTextContent('Sambar is always kept away from soup');
  });

  describe('a base comes with a side when the meal has a chosen curry or subzi', () => {
    async function library() {
      return { papad: await dish('Papad', 'extra'), sambar: await dish('Sambar', 'curry'), rasam: await dish('Rasam', 'curry'),
        beans: await dish('Beans Poriyal', 'subzi'), aloo: await dish('Aloo Gobi', 'subzi') };
    }
    const curryPicker = () => screen.queryByRole('group', { name: 'When the curry is' });
    const subziPicker = () => screen.queryByRole('group', { name: 'When the subzi is' });
    const extraPicker = () => screen.queryByRole('group', { name: 'When the extra is' });

    it('offers both pickers on a base comes-with to extras and stores only the parts ticked', async () => {
      const { papad, sambar, rasam, beans } = await library();
      const onChange = vi.fn();
      render(<Harness initial={[]} componentType="base" onChange={onChange} />);

      await userEvent.click(await readyButton('Add link'));
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Link to' }), 'Specific extras');
      expect(screen.getByRole('button', { name: 'Comes with' })).toHaveAttribute('aria-pressed', 'true');
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Papad' }));
      expect(curryPicker()).toBeInTheDocument();
      expect(subziPicker()).toBeInTheDocument();
      await userEvent.click(within(curryPicker()!).getByRole('checkbox', { name: 'Sambar' }));
      await userEvent.click(within(curryPicker()!).getByRole('checkbox', { name: 'Rasam' }));
      await userEvent.click(within(subziPicker()!).getByRole('checkbox', { name: 'Beans Poriyal' }));
      expect(screen.getByText('Sambar always comes with Papad when the curry is Sambar or Rasam and the subzi is Beans Poriyal')).toBeInTheDocument();
      // Clearing a part leaves it out of the link.
      await userEvent.click(within(subziPicker()!).getByRole('checkbox', { name: 'Beans Poriyal' }));
      await userEvent.click(screen.getByRole('button', { name: 'Done' }));

      expect(onChange).toHaveBeenLastCalledWith([{ mode: 'comes', target: to('extra', 'dish'), values: [papad], strength: 'always', when: { [P.curry]: [sambar, rasam] } }]);
      expect(screen.getByRole('listitem')).toHaveTextContent('Sambar always comes with Papad when the curry is Sambar or Rasam');
      expect(beans).toBeGreaterThan(0);
    });

    it('stores no condition when both pickers are left empty', async () => {
      const { papad } = await library();
      const onChange = vi.fn();
      render(<Harness initial={[]} componentType="base" onChange={onChange} />);
      await userEvent.click(await readyButton('Add link'));
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Link to' }), 'Specific extras');
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Papad' }));
      await userEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(onChange).toHaveBeenLastCalledWith([{ mode: 'comes', target: to('extra', 'dish'), values: [papad], strength: 'always' }]);
    });

    it('offers a picker for every part but the first and the target\'s, and none for a never-with link', async () => {
      const { sambar, aloo } = await library();
      const onChange = vi.fn();
      render(<Harness initial={[]} componentType="base" onChange={onChange} />);
      await userEvent.click(await readyButton('Add link'));
      const linkTo = screen.getByRole('combobox', { name: 'Link to' });

      await userEvent.selectOptions(linkTo, 'Specific subzis');
      expect(curryPicker()).toBeInTheDocument();
      expect(subziPicker()).not.toBeInTheDocument();
      expect(extraPicker()).toBeInTheDocument();
      await userEvent.click(within(curryPicker()!).getByRole('checkbox', { name: 'Sambar' }));

      // A target without the picker clears it, so coming back starts empty.
      await userEvent.selectOptions(linkTo, 'Specific curries');
      expect(curryPicker()).not.toBeInTheDocument();
      expect(subziPicker()).toBeInTheDocument();
      expect(extraPicker()).toBeInTheDocument();
      await userEvent.selectOptions(linkTo, 'Specific subzis');
      expect(within(curryPicker()!).getByRole('checkbox', { name: 'Sambar' })).not.toBeChecked();

      await userEvent.click(screen.getByRole('button', { name: 'Never with' }));
      expect(curryPicker()).not.toBeInTheDocument();
      expect(extraPicker()).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Comes with' }));
      await userEvent.click(within(curryPicker()!).getByRole('checkbox', { name: 'Sambar' }));
      await userEvent.click(screen.getByRole('checkbox', { name: 'Aloo Gobi' }));
      await userEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(onChange).toHaveBeenLastCalledWith([{ mode: 'comes', target: to('subzi', 'dish'), values: [aloo], strength: 'always', when: { [P.curry]: [sambar] } }]);
    });

    it('offers a curry\'s comes-with link a picker for every part but the first, the target\'s and its own, and none on a link served with a higher part', async () => {
      await library();
      render(<Harness initial={[]} componentType="curry" />);
      await userEvent.click(await readyButton('Add link'));
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Link to' }), 'Specific extras');
      expect(screen.getByRole('button', { name: 'Comes with' })).toHaveAttribute('aria-pressed', 'true');
      expect(curryPicker()).not.toBeInTheDocument();
      expect(subziPicker()).toBeInTheDocument();
      expect(extraPicker()).not.toBeInTheDocument();
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Link to' }), 'Specific bases');
      expect(screen.getByRole('button', { name: 'Served with' })).toHaveAttribute('aria-pressed', 'true');
      expect(curryPicker()).not.toBeInTheDocument();
      expect(subziPicker()).not.toBeInTheDocument();
    });

    it('opens a stored conditional link with its parts ticked, and keeps them on Done', async () => {
      const { papad, sambar, beans } = await library();
      const stored: DishLink = { mode: 'comes', target: to('extra', 'dish'), values: [papad], strength: 'usually', when: { [P.curry]: [sambar], [P.subzi]: [beans] }, ruleId: 4 };
      const onChange = vi.fn();
      render(<Harness initial={[stored]} componentType="base" onChange={onChange} />);
      await userEvent.click(await readyButton('Edit'));
      expect(within(curryPicker()!).getByRole('checkbox', { name: 'Sambar' })).toBeChecked();
      expect(within(subziPicker()!).getByRole('checkbox', { name: 'Beans Poriyal' })).toBeChecked();
      await userEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(onChange).toHaveBeenLastCalledWith([stored]);
    });
  });

  it('edits and marks off each of two links of one kind on its own', async () => {
    const coconut = await dish('Coconut Chutney', 'extra');
    const tomato = await dish('Tomato Chutney', 'extra');
    await dish('Mint Chutney', 'extra');
    const first: DishLink = { mode: 'comes', target: to('extra', 'dish'), values: [coconut], strength: 'always', ruleId: 1 };
    const second: DishLink = { mode: 'comes', target: to('extra', 'dish'), values: [tomato], strength: 'always', ruleId: 2 };
    const onChange = vi.fn();
    render(<Harness initial={[first, second]} componentType="base" offRuleIds={[2]} onChange={onChange} />);

    const items = await screen.findAllByRole('listitem');
    await waitFor(() => expect(items[1]).toHaveTextContent('Sambar always comes with Tomato Chutney (off)'));
    expect(items[0]).not.toHaveTextContent('(off)');
    await userEvent.click(await readyButton('Edit', items[1]));
    expect(screen.getAllByRole('button', { name: 'Done' })).toHaveLength(1);
    expect(screen.getByText('Sambar always comes with Coconut Chutney')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Mint Chutney' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onChange).toHaveBeenLastCalledWith([first, { ...second, values: [tomato, expect.any(Number)] }]);
  });

  describe('opened before or after the library loads', () => {
    const loadOrders = [
      ['before the library loads', (ui: React.ReactElement) => render(<LibraryLookupProvider>{ui}</LibraryLookupProvider>)],
      ['once the library has loaded', (ui: React.ReactElement) => {
        function OpenWhenLoaded() {
          return useLibraryLookup().loaded ? ui : null;
        }
        return render(<LibraryLookupProvider><OpenWhenLoaded /></LibraryLookupProvider>);
      }],
    ] as const;

    it.each(loadOrders)('says beside a link that points the wrong way that it is not planned, opened %s', async (_, open) => {
      // A curry's "comes with" link to a base: the base is above the curry, so the planner skips it.
      const idli = await dish('Idli', 'base');
      const papad = await dish('Papad', 'extra');
      open(<Harness initial={[
        { mode: 'comes', target: to('base', 'dish'), values: [idli], strength: 'always' },
        { mode: 'comes', target: to('extra', 'dish'), values: [papad], strength: 'always' },
      ]} />);
      const notice = await screen.findByText('Not planned: points to Base, which is no longer below Curry');
      expect(notice).toHaveClass('text-amber-700');
      // A note like the other amber warnings, not an alert.
      expect(notice).not.toHaveAttribute('role');
      // The link brings a part below the curry, so it is not named.
      expect(screen.getAllByText(/Not planned/)).toHaveLength(1);
    });

    it.each(loadOrders)('reads each stored link as today, and Edit then Done hands back the same links, opened %s', async (_, open) => {
      const rice = await addCategory({ kind: 'base', name: 'Rice Plates' });
      const soup = await curryType('soup');
      const sambar = await dish('Sambar', 'curry');
      const papad = await dish('Papad', 'extra');
      const stored: DishLink[] = [
        { mode: 'with', target: to('base', 'category'), values: [rice], strength: 'always', ruleId: 1 },
        { mode: 'never', target: to('curry', 'category'), values: [soup], strength: 'usually', ruleId: 2 },
        { mode: 'serve', target: to('curry', 'dish'), values: [sambar], strength: 'always', ruleId: 3 },
      ];
      const onChange = vi.fn();
      open(<Harness initial={stored} componentType="extra" selfId={papad} onChange={onChange} />);

      const items = await screen.findAllByRole('listitem');
      await waitFor(() => expect(items[0]).toHaveTextContent('Sambar is always planned only with Rice Plates'));
      expect(items[1]).toHaveTextContent('Sambar is usually kept away from soup');
      expect(items[2]).toHaveTextContent('Sambar is always added when Sambar is in the meal');
      for (let i = 0; i < stored.length; i++) {
        await userEvent.click(await readyButton('Edit', screen.getAllByRole('listitem')[i]));
        await userEvent.click(screen.getByRole('button', { name: 'Done' }));
      }
      const last = onChange.mock.calls.at(-1)![0] as DishLink[];
      expect(last.map((l) => l.ruleId)).toEqual([1, 2, 3]);
      last.forEach((l, i) => expect(sameLink(l, stored[i]), `link ${i}`).toBe(true));
    });
  });
});
