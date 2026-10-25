/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/client';
import { all, any, is } from '@/planner';
import { addComponent } from '@/services/food-db';
import { RuleEditor } from './RuleEditor';

afterEach(() => cleanup());

beforeEach(async () => {
  await Promise.all([db.categories.clear(), db.components.clear(), db.rules.clear()]);
  await addComponent({ name: 'Fish Curry', componentType: 'curry', protein_tag: 'fish', dietary_tags: ['non-veg'], regional_tags: ['coastal-konkan'], occasion_tags: [], created_at: '' });
  await addComponent({ name: 'Dal Tadka', componentType: 'curry', protein_tag: 'dal', dietary_tags: ['veg'], regional_tags: ['north-indian'], occasion_tags: [], created_at: '' });
});

async function choose(trigger: HTMLElement, option: string) {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('option', { name: option }));
}

describe('RuleEditor', () => {
  it('creates a rule from conditions and shows its description and matches', async () => {
    const onSaved = vi.fn();
    render(<RuleEditor onSaved={onSaved} />);

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
    const [rule] = await db.rules.toArray();
    expect(rule).toMatchObject({
      name: 'No fish on Fridays',
      enabled: true,
      spec: { template: 'exclude', params: { match: is('protein_tag', 'fish'), scope: { days: ['friday'] }, strength: 'must' } },
    });
  });

  it('names a rule after its description when the name is left empty', async () => {
    render(<RuleEditor onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Add condition/ }));
    await choose(screen.getByRole('combobox', { name: 'Condition 1 field' }), 'Protein');
    await userEvent.click(screen.getByRole('combobox', { name: 'Add protein' }));
    await userEvent.click(await screen.findByText('fish'));
    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }));

    await waitFor(async () => expect(await db.rules.count()).toBe(1));
    const [rule] = await db.rules.toArray();
    expect(rule.name).toBe('Never include dishes with fish');
  });

  it('groups the rule types by what they do', async () => {
    render(<RuleEditor onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Rule type' }));
    for (const label of ['Where and when', 'Keep out', 'Pair and require', 'Count and spread', 'Preference']) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
  });

  it.each([
    ['Slightly', 3],
    ['Strongly', undefined],
  ])('sets how much a preferred rule matters in words: %s', async (level, cost) => {
    const spec = { template: 'require', params: { match: is('protein_tag', 'fish'), strength: 'prefer', cost: level === 'Slightly' ? undefined : 3 } } as const;
    const id = (await db.rules.add({ name: 'Fish', enabled: true, created_at: '', spec })) as number;
    render(<RuleEditor ruleId={id} initial={{ name: 'Fish', spec }} onSaved={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: 'How much it matters' })).toHaveTextContent(level === 'Slightly' ? 'Strongly' : 'Slightly');
    await choose(screen.getByRole('combobox', { name: 'How much it matters' }), level);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(async () => expect((await db.rules.get(id))?.spec.params).toMatchObject({ strength: 'prefer' }));
    if (cost === undefined) expect((await db.rules.get(id))?.spec.params).not.toHaveProperty('cost');
    else expect((await db.rules.get(id))?.spec.params).toHaveProperty('cost', cost);
  });

  it('uses the same words for the weight of a prefer or avoid rule', async () => {
    const spec = { template: 'prefer', params: { match: is('protein_tag', 'fish'), direction: 'prefer', weight: 4 } } as const;
    const id = (await db.rules.add({ name: 'Fish', enabled: true, created_at: '', spec })) as number;
    render(<RuleEditor ruleId={id} initial={{ name: 'Fish', spec }} onSaved={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: 'How strongly' })).toHaveTextContent('Strongly');
    await choose(screen.getByRole('combobox', { name: 'How strongly' }), 'Slightly');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(async () => expect((await db.rules.get(id))?.spec.params).toMatchObject({ weight: 1 }));
  });

  it('does not save an incomplete rule and says why', async () => {
    const onSaved = vi.fn();
    render(<RuleEditor onSaved={onSaved} />);
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
    render(<RuleEditor ruleId={id} initial={{ name: 'Fish rule', spec: (await db.rules.get(id))!.spec }} onSaved={onSaved} />);

    await choose(screen.getByRole('combobox', { name: 'Rule type' }), 'How often');
    expect(screen.getByText('Dishes with fish: at most 2 per week')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect((await db.rules.get(id))?.spec).toEqual({
      template: 'limit', params: { match: is('protein_tag', 'fish'), per: 'week', max: 2, strength: 'must' },
    });
  });

  it('shows conditions it cannot edit read-only instead of altering them', async () => {
    const nested = all(is('componentType', 'curry'), any(is('protein_tag', 'fish'), is('protein_tag', 'dal')));
    render(<RuleEditor initial={{ name: 'Nested', spec: { template: 'exclude', params: { match: nested } } }} onSaved={vi.fn()} />);
    expect(screen.getByText(/too complex to edit here/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace with simple conditions' })).toBeInTheDocument();
  });

  it('checks a draft against the library and reports conflicts', async () => {
    await addComponent({ name: 'Rice', componentType: 'base', dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: [], created_at: '' });
    await db.rules.add({
      name: 'No fish', enabled: true, created_at: '',
      spec: { template: 'exclude', params: { match: is('protein_tag', 'fish'), strength: 'must' } },
    });
    render(<RuleEditor initial={{
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
      render(<RuleEditor ruleId={id} initial={{ name, spec }} onSaved={vi.fn()} />);
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
