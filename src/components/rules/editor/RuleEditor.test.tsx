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
  await addComponent({ name: 'Fish Curry', componentType: 'curry', protein_tag: 'fish', dietary_tags: ['non-veg'], regional_tags: ['coastal-konkan'], occasion_tags: ['everyday'], created_at: '' });
  await addComponent({ name: 'Dal Tadka', componentType: 'curry', protein_tag: 'dal', dietary_tags: ['veg'], regional_tags: ['north-indian'], occasion_tags: ['everyday'], created_at: '' });
});

async function choose(trigger: HTMLElement, option: string) {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('option', { name: option }));
}

describe('RuleEditor', () => {
  it('creates a rule from conditions and shows its description and matches', async () => {
    const onSaved = vi.fn();
    render(<RuleEditor onSaved={onSaved} />);

    await userEvent.type(screen.getByLabelText('Rule name'), 'No fish on Fridays');
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

  it('does not save an incomplete rule and says why', async () => {
    const onSaved = vi.fn();
    render(<RuleEditor onSaved={onSaved} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }));

    expect(screen.getByText('Give the rule a name')).toBeInTheDocument();
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
    await addComponent({ name: 'Rice', componentType: 'base', dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: ['everyday'], created_at: '' });
    await db.rules.add({
      name: 'No fish', enabled: true, created_at: '',
      spec: { template: 'exclude', params: { match: is('protein_tag', 'fish'), strength: 'must' } },
    });
    render(<RuleEditor initial={{
      name: 'Fish on Friday lunch',
      spec: { template: 'require', params: { match: is('protein_tag', 'fish'), scope: { days: ['friday'], meals: ['lunch'] } } },
    }} onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Check against my library' }));
    expect(await screen.findByText('With this rule, the planner could not meet:')).toBeInTheDocument();
    expect(screen.getByText(/on Friday lunch has/)).toBeInTheDocument();
  });
});
