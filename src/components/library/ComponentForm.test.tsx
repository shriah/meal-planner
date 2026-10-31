/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { addCategory, deleteCategory, renameCategory } from '@/services/category-db';
import { readLink, clashCurryCategories, pairingCategories, pairingRule, ruleDays, ruleMeals } from '@/rules';
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

    expect(await screen.findByRole('combobox', { name: 'Goes with base categories' })).toHaveValue('any');
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

    expect(await screen.findAllByText('Rice-based')).not.toHaveLength(0);

    await renameCategory(riceId, 'Steamed rice');
    await renameCategory(breadId, 'Rotis');

    await waitFor(() => {
      expect(screen.getAllByText('Steamed rice').length).toBeGreaterThan(0);
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

    expect(await screen.findByText('Rice-based')).toBeInTheDocument();

    await deleteCategory(riceId);

    await waitFor(() => {
      expect(screen.queryByText('Rice-based')).not.toBeInTheDocument();
    });
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
    expect(await screen.findByText('Rice Plates')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(async () => expect(await pairedBases(curryId)).toEqual([riceId]));
  });

  it('edits Goes with on a curry as its pairing rule, and all ticked means no rule', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    await addCategory({ kind: 'base', name: 'Flatbreads' });

    render(<ComponentForm componentType="curry" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    // "Only with" starts with every base ticked; unticking Flatbreads limits the curry to rice.
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Goes with base categories' }), 'with');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Flatbreads' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Sambar');
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));
    await waitFor(async () => {
      const [sambar] = await getComponentsByType('curry');
      expect(await pairedBases(sambar.id)).toEqual([riceId]);
    });

    cleanup();
    const [sambar] = await getComponentsByType('curry');
    render(<LiveEditForm componentId={sambar.id} />);
    // Ticking Flatbreads again means every base: the rule goes.
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Flatbreads' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));
    await waitFor(async () => expect(await pairedBases(sambar.id)).toBeUndefined());
  });

  it('will not save a curry that goes with no base unless it is never planned automatically', async () => {
    await addCategory({ kind: 'base', name: 'Rice Plates' });

    render(<ComponentForm componentType="curry" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    await userEvent.type(await screen.findByLabelText('Name'), 'Sambar');
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Goes with base categories' }), 'with');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Rice Plates' }));
    expect(screen.getByRole('button', { name: 'Save Curry' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Never plan automatically' }));
    expect(screen.getByRole('button', { name: 'Save Curry' })).toBeEnabled();
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

  it('links a dish to the categories of any other kind of dish', async () => {
  const liquid = await addCategory({ kind: 'extra', name: 'Liquid' });
    await addCategory({ kind: 'extra', name: 'Crunchy' });
    await addCategory({ kind: 'base', name: 'Rice Plates' });

    render(<ComponentForm componentType="base" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    // A base is not offered base categories, but is offered extra categories and curry types.
    expect(await screen.findByRole('combobox', { name: 'Goes with extra categories' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Goes with base categories' })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Goes with extra categories' }), 'never');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Liquid' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Goes with curry types' }), 'with');
    await userEvent.click(screen.getByRole('checkbox', { name: 'soup' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Idli');
    await userEvent.click(screen.getByRole('button', { name: 'Save Base' }));

    await waitFor(async () => {
      const [idli] = await getComponentsByType('base');
      const clash = await getOwnedRule(idli.id, 'never:extra_category');
      expect(clash && readLink(clash)?.values).toEqual([liquid]);
      const only = await getOwnedRule(idli.id, 'with:curry_category');
      expect(only && readLink(only)?.values).not.toContain('soup');
      expect(only && readLink(only)?.values.length).toBeGreaterThan(0);
    });
  });

  it('links a dish to specific dishes', async () => {
    const baseCategory = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const tags = { dietary_tags: ['veg' as const], regional_tags: [], occasion_tags: [], created_at: new Date().toISOString() };
    const idli = await saveComponent(undefined, { name: 'Idli', componentType: 'base', base_category_id: baseCategory, ...tags });
    await saveComponent(undefined, { name: 'Dosa', componentType: 'base', base_category_id: baseCategory, ...tags });
    const sambar = await saveComponent(undefined, { name: 'Sambar', componentType: 'curry', ...tags });
    await saveComponent(undefined, { name: 'Rasam', componentType: 'curry', ...tags });

    render(<LiveEditForm componentId={sambar} />);

    // A curry is offered specific bases, but not specific curries (a meal has only one).
    expect(screen.queryByRole('combobox', { name: 'Goes with specific curries' })).not.toBeInTheDocument();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Goes with specific bases' }), 'with');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Dosa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(async () => {
      const rule = await getOwnedRule(sambar, 'with:base_dish');
      expect(rule && readLink(rule)?.values).toEqual([idli]);
    });
  });

  it('saves how firmly a link holds', async () => {
    await addCategory({ kind: 'extra', name: 'Crunchy' });

    render(<ComponentForm componentType="extra" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Goes with curry types' }), 'never');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'How firmly, curry types' }), 'sometimes');
    await userEvent.click(screen.getByRole('checkbox', { name: 'soup' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Papad');
    await userEvent.click(screen.getByRole('button', { name: 'Save Extra' }));

    await waitFor(async () => {
      const [papad] = await getComponentsByType('extra');
      const rule = await getOwnedRule(papad.id, 'never:curry_category');
      expect(rule && readLink(rule)).toMatchObject({ values: ['soup'], strength: 'sometimes' });
      expect(rule?.spec.params).toMatchObject({ strength: 'prefer', cost: 3 });
    });
  });

  it('saves the curry types an extra never goes with as a rule it owns', async () => {
    await addCategory({ kind: 'extra', name: 'Crunchy' });

    render(<ComponentForm componentType="extra" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Goes with curry types' }), 'never');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'soup' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Papad');
    await userEvent.click(screen.getByRole('button', { name: 'Save Extra' }));

    await waitFor(async () => {
      const [papad] = await getComponentsByType('extra');
      const rule = await getOwnedRule(papad.id, 'never:curry_category');
      expect(rule && clashCurryCategories(rule)).toEqual(['soup']);
    });
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
