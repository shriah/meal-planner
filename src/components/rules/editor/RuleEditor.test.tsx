/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/client';
import { all, any, is } from '@/planner';
import { addComponent } from '@/services/food-db';
import { ensurePartsAndTagGroups } from '@/db/parts-store';
import type { RuleSpecInput } from '@/rules';
import { RuleEditor } from './RuleEditor';

afterEach(() => cleanup());

beforeEach(async () => {
  await Promise.all([db.categories.clear(), db.components.clear(), db.rules.clear()]);
  await addComponent({ name: 'Fish Curry', componentType: 'curry', protein_tag: 'fish', dietary_tags: ['non-veg'], regional_tags: ['coastal-konkan'], occasion_tags: [], created_at: '' });
  await addComponent({ name: 'Dal Tadka', componentType: 'curry', protein_tag: 'dal', dietary_tags: ['veg'], regional_tags: ['north-indian'], occasion_tags: [], created_at: '' });
});

/** Renders the editor and waits for it to show, once the parts have loaded. */
async function renderLoaded(ui: React.ReactElement) {
  render(ui);
  await screen.findByRole('button', { name: /^(Add rule|Save changes)$/ });
}

async function choose(trigger: HTMLElement, option: string) {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('option', { name: option }));
}

describe('RuleEditor', () => {
  it('creates a rule from conditions and shows its description and matches', async () => {
    const onSaved = vi.fn();
    await renderLoaded(<><RuleEditor onSaved={onSaved} /><Toaster /></>);

    await userEvent.type(screen.getByLabelText(/Rule name/), 'No fish on Fridays');
    await userEvent.click(screen.getByRole('button', { name: /Add condition/ }));
    await choose(screen.getByRole('combobox', { name: 'Condition 1 field' }), 'Protein');
    await userEvent.click(screen.getByRole('combobox', { name: 'Add protein' }));
    await userEvent.click(await screen.findByText('fish'));
    await userEvent.click(within(screen.getByRole('group', { name: 'Days' })).getByRole('button', { name: 'Fri' }));

    expect(screen.getByText('Matches 1 dish: Fish Curry')).toBeInTheDocument();
    expect(screen.getByText('Never include dishes with fish on Friday')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(await screen.findByText('Rule “No fish on Fridays” added')).toBeInTheDocument();
    const [rule] = await db.rules.toArray();
    expect(rule).toMatchObject({
      name: 'No fish on Fridays',
      enabled: true,
      spec: { template: 'exclude', params: { match: is('protein_tag', 'fish'), scope: { days: ['friday'] }, strength: 'must' } },
    });
  });

  it('names a rule after its description when the name is left empty', async () => {
    await renderLoaded(<RuleEditor onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Add condition/ }));
    await choose(screen.getByRole('combobox', { name: 'Condition 1 field' }), 'Protein');
    await userEvent.click(screen.getByRole('combobox', { name: 'Add protein' }));
    await userEvent.click(await screen.findByText('fish'));
    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }));

    await waitFor(async () => expect(await db.rules.count()).toBe(1));
    const [rule] = await db.rules.toArray();
    expect(rule.name).toBe('Never include dishes with fish');
  });

  it('offers part and category conditions by name, and saves them as part and category leaves', async () => {
    const { parts } = await ensurePartsAndTagGroups();
    const partOf = (legacy: string) => parts.find((p) => p.legacy === legacy)!.id;
    const rice = (await db.categories.add({ kind: 'base', name: 'Rice-based', part_id: partOf('base'), created_at: '' })) as number;
    await renderLoaded(<RuleEditor onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /Add condition/ }));
    await choose(screen.getByRole('combobox', { name: 'Condition 1 field' }), 'Part');
    await choose(await screen.findByRole('combobox', { name: 'Add part' }), 'Curry');
    await userEvent.click(screen.getByRole('button', { name: /Add condition/ }));
    await choose(screen.getByRole('combobox', { name: 'Condition 2 field' }), 'Category');
    await choose(await screen.findByRole('combobox', { name: 'Add category' }), 'Rice-based (Base)');

    expect(screen.getByText('Never include curries in the Rice-based category')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    await waitFor(async () => expect(await db.rules.count()).toBe(1));
    const [rule] = await db.rules.toArray();
    expect(rule.spec).toEqual({ template: 'exclude', params: { match: all(is('part', partOf('curry')), is('category', rice)), strength: 'must' } });
  });

  it('chooses the parts a rule covers by name, and never offers to leave out the first part', async () => {
    const { parts } = await ensurePartsAndTagGroups();
    const partOf = (legacy: string) => parts.find((p) => p.legacy === legacy)!.id;
    const spec: RuleSpecInput = { template: 'skip_when', params: { when: is('protein_tag', 'fish'), skip: [], strength: 'must' } };
    await renderLoaded(<RuleEditor initial={{ name: 'No subzi with fish', spec }} onSaved={vi.fn()} />);

    const leaveOut = await screen.findByRole('group', { name: 'Leave out' });
    await waitFor(() => expect(within(leaveOut).getAllByRole('button').map((b) => b.textContent)).toEqual(['Curry', 'Subzi', 'Extras']));
    await userEvent.click(within(leaveOut).getByRole('button', { name: 'Subzi' }));
    expect(screen.getByText('With dishes with fish, no subzis')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }));

    await waitFor(async () => expect(await db.rules.count()).toBe(1));
    expect((await db.rules.toArray())[0].spec.params).toMatchObject({ skip: [partOf('subzi')] });
  });

  it('still edits a condition on a field it no longer offers, as an assistant draft may hold', async () => {
    const spec: RuleSpecInput = { template: 'exclude', params: { match: is('componentType', 'curry'), strength: 'must' } };
    await renderLoaded(<RuleEditor initial={{ name: 'No curries', spec }} onSaved={vi.fn()} />);

    expect(screen.queryByText(/too complex to edit here/)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Condition 1 field' })).toHaveTextContent('Type');
    expect(screen.getByText('Never include curries')).toBeInTheDocument();
  });

  it('groups the rule types by what they do', async () => {
    await renderLoaded(<RuleEditor onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Rule type' }));
    for (const label of ['Where and when', 'Keep out', 'Pair and require', 'Count and spread', 'Preference']) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByRole('option', { name: 'Comes with' })).not.toBeInTheDocument();
  });

  it.each([
    ['Sometimes', 3],
    ['Usually', undefined],
  ])('sets how much a preferred rule matters in words: %s', async (level, cost) => {
    const spec = { template: 'require', params: { match: is('protein_tag', 'fish'), strength: 'prefer', cost: level === 'Sometimes' ? undefined : 3 } } as const;
    const id = (await db.rules.add({ name: 'Fish', enabled: true, created_at: '', spec })) as number;
    await renderLoaded(<RuleEditor ruleId={id} initial={{ name: 'Fish', spec }} onSaved={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: 'How much it matters' })).toHaveTextContent(level === 'Sometimes' ? 'Usually' : 'Sometimes');
    await choose(screen.getByRole('combobox', { name: 'How much it matters' }), level);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(async () => expect((await db.rules.get(id))?.spec.params).toMatchObject({ strength: 'prefer' }));
    if (cost === undefined) expect((await db.rules.get(id))?.spec.params).not.toHaveProperty('cost');
    else expect((await db.rules.get(id))?.spec.params).toHaveProperty('cost', cost);
  });

  it('shows a stored cost of 6 as Often', async () => {
    const spec = { template: 'require', params: { match: is('protein_tag', 'fish'), strength: 'prefer', cost: 6 } } as const;
    await renderLoaded(<RuleEditor initial={{ name: 'Fish', spec }} onSaved={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'How much it matters' })).toHaveTextContent('Often');
  });

  it('uses the same words for the weight of a prefer or avoid rule', async () => {
    const spec = { template: 'prefer', params: { match: is('protein_tag', 'fish'), direction: 'prefer', weight: 4 } } as const;
    const id = (await db.rules.add({ name: 'Fish', enabled: true, created_at: '', spec })) as number;
    await renderLoaded(<RuleEditor ruleId={id} initial={{ name: 'Fish', spec }} onSaved={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: 'How strongly' })).toHaveTextContent('Strongly');
    await choose(screen.getByRole('combobox', { name: 'How strongly' }), 'Slightly');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(async () => expect((await db.rules.get(id))?.spec.params).toMatchObject({ weight: 1 }));
  });

  it('does not save an incomplete rule and says why', async () => {
    const onSaved = vi.fn();
    await renderLoaded(<RuleEditor onSaved={onSaved} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }));

    // The empty name is not an error: it falls back to the rule's description.
    expect(screen.queryByText('Give the rule a name')).not.toBeInTheDocument();
    expect(screen.getByText('Add at least one condition')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(await db.rules.count()).toBe(0);
  });

  it('edits a stored rule and keeps its condition when switching rule type', async () => {
    const id = (await db.rules.add({
      name: 'Fish rule', enabled: true, created_at: '',
      spec: { template: 'exclude', params: { match: is('protein_tag', 'fish'), strength: 'must' } },
    })) as number;
    const onSaved = vi.fn();
    await renderLoaded(<><RuleEditor ruleId={id} initial={{ name: 'Fish rule', spec: (await db.rules.get(id))!.spec }} onSaved={onSaved} /><Toaster /></>);

    await choose(screen.getByRole('combobox', { name: 'Rule type' }), 'How often');
    expect(screen.getByText('Dishes with fish: at most 2 per week')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(await screen.findByText('Rule “Fish rule” saved')).toBeInTheDocument();
    expect((await db.rules.get(id))?.spec).toEqual({
      template: 'limit', params: { match: is('protein_tag', 'fish'), per: 'week', max: 2, strength: 'must' },
    });
  });

  it('shows conditions it cannot edit read-only instead of altering them', async () => {
    const nested = all(is('componentType', 'curry'), any(is('protein_tag', 'fish'), is('protein_tag', 'dal')));
    await renderLoaded(<RuleEditor initial={{ name: 'Nested', spec: { template: 'exclude', params: { match: nested } } }} onSaved={vi.fn()} />);
    expect(screen.getByText(/too complex to edit here/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace with simple conditions' })).toBeInTheDocument();
  });

  it('checks a draft against the library and reports conflicts', async () => {
    await addComponent({ name: 'Rice', componentType: 'base', dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: [], created_at: '' });
    await db.rules.add({
      name: 'No fish', enabled: true, created_at: '',
      spec: { template: 'exclude', params: { match: is('protein_tag', 'fish'), strength: 'must' } },
    });
    await renderLoaded(<RuleEditor initial={{
      name: 'Fish on Friday lunch',
      spec: { template: 'require', params: { match: is('protein_tag', 'fish'), scope: { days: ['friday'], meals: ['lunch'] } } },
    }} onSaved={vi.fn()} />);

    // The check runs by itself once editing pauses.
    expect(await screen.findByText('With this rule, the planner could not meet:', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getAllByText(/— Friday lunch$/).length).toBeGreaterThan(0);
  });

  describe('a rule saved without a name', () => {
    const spec = { template: 'exclude', params: { match: is('protein_tag', 'fish'), strength: 'must' } } as const;
    const open = async (name: string) => {
      const id = (await db.rules.add({ name, enabled: true, created_at: '', spec })) as number;
      await renderLoaded(<RuleEditor ruleId={id} initial={{ name, spec }} onSaved={vi.fn()} />);
      return id;
    };
    const addFriday = () => userEvent.click(within(screen.getByRole('group', { name: 'Days' })).getByRole('button', { name: 'Fri' }));

    it('keeps following its description when it is edited and saved again', async () => {
      const id = await open('Never include dishes with fish');
      await waitFor(() => expect(screen.getByLabelText(/Rule name/)).toHaveValue(''));

      await addFriday();
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(async () => expect((await db.rules.get(id))?.name).toBe('Never include dishes with fish on Friday'));
    });

    it('keeps a name the user chose', async () => {
      const id = await open('No fish');
      expect(screen.getByLabelText(/Rule name/)).toHaveValue('No fish');

      await addFriday();
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(async () => expect((await db.rules.get(id))?.spec.params).toMatchObject({ scope: { days: ['friday'] } }));
      expect((await db.rules.get(id))?.name).toBe('No fish');
    });
  });
});
