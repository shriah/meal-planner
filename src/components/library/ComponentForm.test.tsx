/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/client';
import { addCategory, deleteCategory, renameCategory } from '@/services/category-db';
import { readLink, clashCurryCategories, curryClashRule, pairingCategories, pairingRule, ruleDays, ruleMeals } from '@/rules';
import * as foodDb from '@/services/food-db';
import { getComponentsByType, getOwnedRule, saveComponent } from '@/services/food-db';
import { ComponentForm } from './ComponentForm';
import { ComponentRow } from './ComponentRow';

const pairedBases = async (id: number) => {
  const rule = await getOwnedRule(id, 'with:base_category');
  return rule && pairingCategories(rule);
};

afterEach(() => {
  cleanup();
});

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
  it('shows day checkboxes only for specific days', async () => {
    render(<ComponentForm componentType="subzi" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    expect(screen.getByRole('combobox', { name: 'Days' })).toHaveTextContent('Any day');
    expect(screen.queryByRole('checkbox', { name: 'monday' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Days' }));
    await userEvent.click(screen.getByRole('option', { name: 'Specific days' }));

    expect(screen.getByRole('checkbox', { name: 'monday' })).toBeInTheDocument();
  });

  it.each([
    ['Weekdays', ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']],
    ['Weekends', ['saturday', 'sunday']],
  ])('saves %s as a rule the dish owns', async (mode, days) => {
    render(<ComponentForm componentType="subzi" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Days' }));
    await userEvent.click(screen.getByRole('option', { name: mode }));
    await userEvent.type(screen.getByLabelText('Name'), 'Beans');
    await userEvent.click(screen.getByRole('button', { name: 'Save Subzi' }));

    await waitFor(async () => {
      const [beans] = await getComponentsByType('subzi');
      const rule = await getOwnedRule(beans.id, 'allowed_days');
      expect(rule && ruleDays(rule)).toEqual(days);
    });
  });

  it('saves the allowed meals as a rule the dish owns, and clearing them again removes it', async () => {
    await addCategory({ kind: 'base', name: 'Steamed' });
    render(<ComponentForm componentType="base" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    expect(screen.getByRole('checkbox', { name: 'breakfast' })).not.toBeChecked();
    expect(screen.getByText('None selected: any meal.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'breakfast' }));
    await userEvent.click(await screen.findByRole('combobox', { name: 'Base Category' }));
    await userEvent.click(screen.getByRole('option', { name: 'Steamed' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Breakfast Idli');
    await userEvent.click(screen.getByRole('button', { name: 'Save Base' }));

    await waitFor(async () => {
      const [beans] = await getComponentsByType('base');
      const rule = await getOwnedRule(beans.id, 'allowed_meals');
      expect(rule && ruleMeals(rule)).toEqual(['breakfast']);
    });

    cleanup();
    const [beans] = await getComponentsByType('base');
    render(<LiveEditForm componentId={beans.id} />);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'breakfast' })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: 'lunch' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('checkbox', { name: 'breakfast' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save Base' }));
    await waitFor(async () => expect(await getOwnedRule(beans.id, 'allowed_meals')).toBeUndefined());
  });

  it('offers the meals setting for bases only', async () => {
    const { rerender } = render(<ComponentForm componentType="base" mode="add" onSave={() => {}} onDiscard={() => {}} />);
    expect(screen.getByRole('checkbox', { name: 'breakfast' })).toBeInTheDocument();

    for (const type of ['curry', 'subzi', 'extra'] as const) {
      rerender(<ComponentForm key={type} componentType={type} mode="add" onSave={() => {}} onDiscard={() => {}} />);
      expect(screen.queryByRole('checkbox', { name: 'breakfast' })).not.toBeInTheDocument();
    }
  });

  it('saves specific days as a rule the dish owns, and switching back to any day removes it', async () => {
    render(<ComponentForm componentType="subzi" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Days' }));
    await userEvent.click(screen.getByRole('option', { name: 'Specific days' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'monday' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Monday Beans');
    await userEvent.click(screen.getByRole('button', { name: 'Save Subzi' }));

    await waitFor(async () => {
      const subzis = await getComponentsByType('subzi');
      expect(subzis).toHaveLength(1);
      expect(subzis[0].occasion_tags).toEqual([]);
      const rule = await getOwnedRule(subzis[0].id, 'allowed_days');
      expect(rule && ruleDays(rule)).toEqual(['monday']);
    });

    cleanup();
    const [beans] = await getComponentsByType('subzi');
    render(<LiveEditForm componentId={beans.id} />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Days' })).toHaveTextContent('Specific days'));
    expect(screen.getByRole('checkbox', { name: 'monday' })).toBeChecked();

    await userEvent.click(screen.getByRole('combobox', { name: 'Days' }));
    await userEvent.click(screen.getByRole('option', { name: 'Any day' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save Subzi' }));
    await waitFor(async () => expect(await getOwnedRule(beans.id, 'allowed_days')).toBeUndefined());
  });

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

  it('saves no pairing rule for a new curry that goes with every base', async () => {
    await addCategory({ kind: 'base', name: 'Rice Plates' });

    render(<ComponentForm componentType="curry" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    expect(await screen.findByText('Goes with anything.')).toBeInTheDocument();
    expect(screen.queryByText('Compatible Base Categories')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Name'), 'Sambar');
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(async () => {
      const curries = await getComponentsByType('curry');
      expect(curries).toHaveLength(1);
      expect(await pairedBases(curries[0].id)).toBeUndefined();
    });
  });
  it('lets a curry with no bases chosen go with any base, and marks one never planned automatically', async () => {
    await addCategory({ kind: 'base', name: 'Rice Plates' });

    render(<ComponentForm componentType="curry" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Never plan automatically' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Plain Tomato Curry');
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(async () => {
      const curries = await getComponentsByType('curry');
      expect(curries).toHaveLength(1);
      expect(await pairedBases(curries[0].id)).toBeUndefined();
      expect(await getOwnedRule(curries[0].id, 'exclude')).toBeDefined();
    });
  });

  it('refreshes form and row labels after a category rename without rewriting stored references', async () => {
    await addCategory({ kind: 'base', name: 'Rice-based' });
    const liquidId = await addCategory({ kind: 'extra', name: 'Liquid' });
    const extraId = await db.components.add({
      name: 'Rasam',
      componentType: 'extra',
      extra_category_id: liquidId,
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: [],
      created_at: new Date().toISOString(),
    }) as number;

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
    const curryId = await saveComponent(undefined, {
      name: 'Sambar',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: [],
      created_at: new Date().toISOString(),
    }, { 'with:base_category': (c) => pairingRule(c, [riceId]) });

    render(
      <>
        <LiveEditForm componentId={curryId} />
        <LiveComponentRow componentId={curryId} />
      </>,
    );

    expect(await screen.findAllByText(/Rice-based/)).not.toHaveLength(0);

    await renameCategory(riceId, 'Steamed rice');
    await renameCategory(breadId, 'Rotis');

    await waitFor(() => {
      expect(screen.getAllByText(/Steamed rice/).length).toBeGreaterThan(0);
    });

    expect(await pairedBases(curryId)).toEqual([riceId]);
  });

  it('keeps curry edit state aligned when deleting its last compatible base category removes the pairing', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice-based' });
    const curryId = await saveComponent(undefined, {
      name: 'Sambar',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: [],
      created_at: new Date().toISOString(),
    }, { 'with:base_category': (c) => pairingRule(c, [riceId]) });

    render(<LiveEditForm componentId={curryId} />);

    expect(await screen.findByText(/planned only with Rice-based/)).toBeInTheDocument();

    await deleteCategory(riceId);

    await waitFor(() => {
      expect(screen.queryByText(/planned only with Rice-based/)).not.toBeInTheDocument();
    });
    expect(screen.getByText('Goes with anything.')).toBeInTheDocument();
    expect(await pairedBases(curryId)).toBeUndefined();
  });

  it('saves a curry type on the curry itself', async () => {
    render(<ComponentForm componentType="curry" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Curry Type' }));
    await userEvent.click(screen.getByRole('option', { name: 'legume' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Chole');
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(async () => {
      const [curry] = await getComponentsByType('curry');
      expect(curry.curry_category).toBe('legume');
    });
  });

  it('does not give a new subzi a base pairing', async () => {
    await addCategory({ kind: 'base', name: 'Rice Plates' });

    render(<ComponentForm componentType="subzi" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    await userEvent.type(await screen.findByLabelText('Name'), 'Beans');
    await userEvent.click(screen.getByRole('button', { name: 'Save Subzi' }));
    await waitFor(async () => expect(await getComponentsByType('subzi')).toHaveLength(1));
    const [beans] = await getComponentsByType('subzi');
    expect(await getOwnedRule(beans.id, 'with:base_category')).toBeUndefined();
  });

  it('saving a curry leaves the pairing rule it already has alone', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    await addCategory({ kind: 'base', name: 'Flatbreads' });
    const curryId = await saveComponent(undefined, {
      name: 'Sambar', componentType: 'curry', dietary_tags: ['veg'], regional_tags: [], occasion_tags: [], created_at: new Date().toISOString(),
    }, { 'with:base_category': (c) => pairingRule(c, [riceId]) });

    render(<LiveEditForm componentId={curryId} />);
    expect(await screen.findByText(/planned only with Rice Plates/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(async () => expect(await pairedBases(curryId)).toEqual([riceId]));
  });

  it("lists on a base's form the curries and subzis that go with its category", async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const breadId = await addCategory({ kind: 'base', name: 'Flatbreads' });
    const tags = { dietary_tags: ['veg' as const], regional_tags: [], occasion_tags: [], created_at: new Date().toISOString() };
    await saveComponent(undefined, { name: 'Sambar', componentType: 'curry', ...tags }, { 'with:base_category': (c) => pairingRule(c, [riceId]) });
    await saveComponent(undefined, { name: 'Chole', componentType: 'curry', ...tags }, { 'with:base_category': (c) => pairingRule(c, [breadId]) });
    await saveComponent(undefined, { name: 'Beans', componentType: 'subzi', ...tags });
    const baseId = await saveComponent(undefined, { name: 'Steamed Rice', componentType: 'base', base_category_id: riceId, ...tags });

    render(<LiveEditForm componentId={baseId} />);

    expect(await screen.findByText('Base to')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sambar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beans' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Chole' })).not.toBeInTheDocument();
  });

  it('sets how often a dish is planned, and shows it when editing', async () => {
    render(<ComponentForm componentType="curry" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    expect(screen.getByRole('combobox', { name: 'How often' })).toHaveTextContent('Normal');
    await userEvent.click(screen.getByRole('combobox', { name: 'How often' }));
    await userEvent.click(screen.getByRole('option', { name: 'Often' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Dal');
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(async () => {
      const [dal] = await getComponentsByType('curry');
      expect(dal.frequency).toBe('frequent');
    });

    cleanup();
    const [dal] = await getComponentsByType('curry');
    await db.components.update(dal.id, { frequency: 'rare' });
    render(<LiveEditForm componentId={dal.id} />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'How often' })).toHaveTextContent('Rarely'));
  });

  it.each(['curry', 'extra'] as const)('groups what becomes a rule under a Planning heading for a %s', async (type) => {
    await addCategory({ kind: 'extra', name: 'Crunchy' });
    render(<ComponentForm componentType={type} mode="add" onSave={() => {}} onDiscard={() => {}} />);

    expect(screen.getByRole('heading', { name: 'Planning' })).toBeInTheDocument();
    expect(screen.getByText(/saved as rules/i)).toBeInTheDocument();
    const planning = screen.getByRole('heading', { name: 'Planning' }).closest('section')!;
    expect(planning).toContainElement(screen.getByRole('combobox', { name: 'Days' }));
    expect(planning).toContainElement(screen.getByRole('checkbox', { name: 'Never plan automatically' }));
  });

  it('says occasion tags are for use in rules', () => {
    render(<ComponentForm componentType="curry" mode="add" onSave={() => {}} onDiscard={() => {}} />);
    expect(screen.getByText(/use them in rules/i)).toBeInTheDocument();
  });
});

const tags = { dietary_tags: ['veg' as const], regional_tags: [], occasion_tags: [], created_at: new Date().toISOString() };

async function addLink(target: string, mode: 'Only with' | 'Never with', values: string[], strength?: string) {
  await userEvent.click(await readyButton('Add link'));
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Link to' }), target);
  await userEvent.click(screen.getByRole('button', { name: mode }));
  if (strength) await userEvent.click(screen.getByRole('button', { name: strength }));
  for (const value of values) await userEvent.click(await screen.findByRole('checkbox', { name: value }));
  await userEvent.click(screen.getByRole('button', { name: 'Done' }));
}

describe('ComponentForm links', () => {
  afterEach(() => vi.restoreAllMocks());

  it('adds an only-with base link and saves it as a pairing rule', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    await addCategory({ kind: 'base', name: 'Flatbreads' });

    render(<ComponentForm componentType="curry" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    await userEvent.click(await readyButton('Add link'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Link to' }), 'Base categories');
    // Nothing ticked leaves the dish nowhere to go, so the link cannot be finished.
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await addLink('Base categories', 'Only with', ['Rice Plates']);
    await userEvent.type(screen.getByLabelText('Name'), 'Sambar');
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));
    await waitFor(async () => {
      const [sambar] = await getComponentsByType('curry');
      expect(await pairedBases(sambar.id)).toEqual([riceId]);
    });

    cleanup();
    const [sambar] = await getComponentsByType('curry');
    render(<LiveEditForm componentId={sambar.id} />);
    // Ticking Flatbreads too means every base: the rule goes.
    await userEvent.click(await readyButton('Edit'));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Flatbreads' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));
    await waitFor(async () => expect(await pairedBases(sambar.id)).toBeUndefined());
  });

  it('offers each kind of dish only the links that suit it', async () => {
    const { rerender } = render(<ComponentForm componentType="base" mode="add" onSave={() => {}} onDiscard={() => {}} />);
    await userEvent.click(await readyButton('Add link'));
    let targets = within(screen.getByRole('combobox', { name: 'Link to' })).getAllByRole('option').map((o) => o.textContent);
    expect(targets).toContain('Extra categories');
    expect(targets).toContain('Curry types');
    expect(targets).not.toContain('Base categories');
    expect(targets).not.toContain('Specific bases');

    rerender(<ComponentForm key="curry" componentType="curry" mode="add" onSave={() => {}} onDiscard={() => {}} />);
    await userEvent.click(await readyButton('Add link'));
    targets = within(screen.getByRole('combobox', { name: 'Link to' })).getAllByRole('option').map((o) => o.textContent);
    expect(targets).toContain('Specific bases');
    expect(targets).not.toContain('Specific curries');
  });

  it('saves both modes of one target', async () => {
    const baseCategory = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const idli = await saveComponent(undefined, { name: 'Idli', componentType: 'base', base_category_id: baseCategory, ...tags });
    const dosa = await saveComponent(undefined, { name: 'Dosa', componentType: 'base', base_category_id: baseCategory, ...tags });
    await saveComponent(undefined, { name: 'Pongal', componentType: 'base', base_category_id: baseCategory, ...tags });
    const sambar = await saveComponent(undefined, { name: 'Sambar', componentType: 'curry', ...tags });

    render(<LiveEditForm componentId={sambar} />);
    await addLink('Specific bases', 'Only with', ['Idli', 'Dosa']);
    await addLink('Specific bases', 'Never with', ['Dosa'], 'Usually');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(async () => {
      const only = await getOwnedRule(sambar, 'with:base_dish');
      expect(only && readLink(only)?.values).toEqual([idli, dosa]);
      const never = await getOwnedRule(sambar, 'never:base_dish');
      expect(never && readLink(never)).toMatchObject({ values: [dosa], strength: 'usually' });
    });
  });

  it('removing a link deletes its rule', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const curryId = await saveComponent(undefined, { name: 'Sambar', componentType: 'curry', ...tags }, {
      'with:base_category': (c) => pairingRule(c, [riceId]),
      'never:curry_category': (c) => curryClashRule(c, ['soup']),
    });

    render(<LiveEditForm componentId={curryId} />);
    const item = await screen.findByText(/planned only with Rice Plates/);
    await userEvent.click(await readyButton('Remove', item.closest('li')!));
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(async () => expect(await pairedBases(curryId)).toBeUndefined());
    expect(await getOwnedRule(curryId, 'never:curry_category')).toBeDefined();
  });

  it('saving without touching links writes no link rule changes', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const curryId = await saveComponent(undefined, { name: 'Sambar', componentType: 'curry', ...tags }, {
      'with:base_category': (c) => pairingRule(c, [riceId], 'moderately'),
      'never:curry_category': (c) => curryClashRule(c, ['soup']),
    });
    // A hand-edited cost reads back as "often" but must not be rewritten as 6.
    const stored = (await getOwnedRule(curryId, 'with:base_category'))!;
    await db.rules.update(stored.id, { spec: { ...stored.spec, params: { ...stored.spec.params, cost: 5 } } as typeof stored.spec });
    const save = vi.spyOn(foodDb, 'saveComponent');

    render(<LiveEditForm componentId={curryId} />);
    expect(await screen.findByText(/often planned only with Rice Plates/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const changes = save.mock.calls[0][2] ?? {};
    expect(Object.keys(changes).filter((k) => k.startsWith('with:') || k.startsWith('never:'))).toEqual([]);
    expect((await getOwnedRule(curryId, 'with:base_category'))?.spec.params).toMatchObject({ strength: 'prefer', cost: 5 });
  });

  it('saves only the links that changed', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const curryId = await saveComponent(undefined, { name: 'Sambar', componentType: 'curry', ...tags }, {
      'with:base_category': (c) => pairingRule(c, [riceId], 'moderately'),
    });
    const stored = (await getOwnedRule(curryId, 'with:base_category'))!;
    await db.rules.update(stored.id, { spec: { ...stored.spec, params: { ...stored.spec.params, cost: 5 } } as typeof stored.spec });

    render(<LiveEditForm componentId={curryId} />);
    await screen.findByText(/often planned only with Rice Plates/);
    await addLink('Curry types', 'Never with', ['soup']);
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(async () => expect(await getOwnedRule(curryId, 'never:curry_category')).toBeDefined());
    expect((await getOwnedRule(curryId, 'with:base_category'))?.spec.params).toMatchObject({ strength: 'prefer', cost: 5 });
  });

  it('saves links on a new dish', async () => {
    const liquid = await addCategory({ kind: 'extra', name: 'Liquid' });
    await addCategory({ kind: 'extra', name: 'Crunchy' });

    render(<ComponentForm componentType="extra" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    await addLink('Curry types', 'Never with', ['soup'], 'Sometimes');
    await addLink('Extra categories', 'Never with', ['Liquid']);
    await userEvent.type(screen.getByLabelText('Name'), 'Papad');
    await userEvent.click(screen.getByRole('button', { name: 'Save Extra' }));

    await waitFor(async () => {
      const [papad] = await getComponentsByType('extra');
      const clash = await getOwnedRule(papad.id, 'never:curry_category');
      expect(clash && clashCurryCategories(clash)).toEqual(['soup']);
      expect(clash?.spec.params).toMatchObject({ strength: 'prefer', cost: 3 });
      const extras = await getOwnedRule(papad.id, 'never:extra_category');
      expect(extras && readLink(extras)?.values).toEqual([liquid]);
    });
  });
});

describe('ComponentForm draft prefill', () => {
  it('opens a curry from a draft without writing, and saves it once', async () => {
    render(
      <ComponentForm
        componentType="curry"
        mode="add"
        draft={{ name: 'Chole', curry_category: 'legume', protein_tag: 'none' }}
        onSave={() => {}}
        onDiscard={() => {}}
      />,
    );

    expect(screen.getByLabelText('Name')).toHaveValue('Chole');
    expect(screen.getByRole('combobox', { name: 'Curry Type' })).toHaveTextContent('legume');
    expect(await db.components.count()).toBe(0);

    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));
    await waitFor(async () => {
      const curries = await getComponentsByType('curry');
      expect(curries).toHaveLength(1);
      expect(curries[0].name).toBe('Chole');
      expect(curries[0].curry_category).toBe('legume');
    });
  });

  it('confirms a saved dish with a toast', async () => {
    render(<><ComponentForm componentType="curry" mode="add" onSave={() => {}} onDiscard={() => {}} /><Toaster /></>);
    await userEvent.type(screen.getByLabelText('Name'), 'Toasted Chole');
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));
    expect(await screen.findByText('Toasted Chole added to the library')).toBeInTheDocument();
  });

  it('keeps the draft editable before saving', async () => {
    render(
      <ComponentForm componentType="curry" mode="add" draft={{ name: 'Chole' }} onSave={() => {}} onDiscard={() => {}} />,
    );
    await userEvent.type(screen.getByLabelText('Name'), ' Masala');
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));
    await waitFor(async () => expect((await getComponentsByType('curry'))[0]?.name).toBe('Chole Masala'));
  });

  it('prefills tags and stores the built-in base_type for a base draft', async () => {
    await addCategory({ kind: 'base', name: 'rice-based' });
    const breadId = await addCategory({ kind: 'base', name: 'bread-based' });

    render(
      <ComponentForm
        componentType="base"
        mode="add"
        draft={{ name: 'Phulka', base_category_id: breadId, dietary_tags: ['veg'], regional_tags: ['north-indian'] }}
        onSave={() => {}}
        onDiscard={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Base Category' })).toHaveTextContent('bread-based'));
    expect(screen.getByLabelText('veg')).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Save Base' }));

    await waitFor(async () => {
      const [phulka] = await getComponentsByType('base');
      expect(phulka.base_category_id).toBe(breadId);
      expect(phulka.base_type).toBe('bread-based');
      expect(phulka.dietary_tags).toEqual(['veg']);
    });
  });

  it('stores the built-in extra_category for an extra draft', async () => {
    await addCategory({ kind: 'extra', name: 'liquid' });
    const crunchyId = await addCategory({ kind: 'extra', name: 'crunchy' });

    render(
      <ComponentForm
        componentType="extra"
        mode="add"
        draft={{ name: 'Papad', extra_category_id: crunchyId }}
        onSave={() => {}}
        onDiscard={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Extra Category' })).toHaveTextContent('crunchy'));
    await userEvent.click(screen.getByRole('button', { name: 'Save Extra' }));

    await waitFor(async () => {
      const [papad] = await getComponentsByType('extra');
      expect(papad.extra_category_id).toBe(crunchyId);
      expect(papad.extra_category).toBe('crunchy');
    });
  });

  it('ignores a draft when editing an existing dish', async () => {
    const id = await db.components.add({
      name: 'Dal', componentType: 'curry', dietary_tags: [], regional_tags: [], occasion_tags: [],
      created_at: new Date().toISOString(),
    }) as number;
    const component = (await db.components.get(id))!;
    render(
      <ComponentForm component={component} componentType="curry" mode="edit" draft={{ name: 'Other' }} onSave={() => {}} onDiscard={() => {}} />,
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Dal');
  });
});
