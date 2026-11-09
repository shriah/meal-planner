/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/client';
import { is } from '@/planner';
import { addCategory, deleteCategory, renameCategory } from '@/services/category-db';
import { readLink, clashCurryCategories, linkRule, pairingCategories, pairingRule, ruleDays, ruleMeals, type DishLink, type RuleRecord } from '@/rules';
import * as foodDb from '@/services/food-db';
import { getComponentsByType, getOwnedRule, saveComponent } from '@/services/food-db';
import { ComponentForm } from './ComponentForm';
import { ComponentRow } from './ComponentRow';
import { LibraryLookupProvider, useLibraryLookup } from './LibraryLookup';
import { dayRule, mealRule } from '@/rules';

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

function LiveEditForm({ componentId, draftLinks }: { componentId: number; draftLinks?: DishLink[] }) {
  const component = useLiveQuery(() => db.components.get(componentId), [componentId], undefined);

  if (!component) {
    return null;
  }

  return (
    <ComponentForm
      component={component}
      componentType={component.componentType}
      mode="edit"
      draftLinks={draftLinks}
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
    }, {}, [{ kind: 'add', link: { mode: 'with', target: 'base_category', values: [riceId], strength: 'always' } }]);

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
    }, {}, [{ kind: 'add', link: { mode: 'with', target: 'base_category', values: [riceId], strength: 'always' } }]);

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
    }, {}, [{ kind: 'add', link: { mode: 'with', target: 'base_category', values: [riceId], strength: 'always' } }]);

    render(<LiveEditForm componentId={curryId} />);
    expect(await screen.findByText(/planned only with Rice Plates/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(async () => expect(await pairedBases(curryId)).toEqual([riceId]));
  });

  it('shows no served-with section on a base, and saving it leaves the sides\' links alone', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const tags = { dietary_tags: ['veg' as const], regional_tags: [], occasion_tags: [], created_at: new Date().toISOString() };
    const pongal = await saveComponent(undefined, { name: 'Pongal', componentType: 'base', base_category_id: riceId, ...tags });
    const sambar = await saveComponent(undefined, { name: 'Sambar', componentType: 'curry', ...tags }, {}, [
      { kind: 'add', link: { mode: 'serve', target: 'base_dish', values: [pongal], strength: 'moderately' } },
    ]);
    const before = await getOwnedRule(sambar, 'serve:base_dish');

    render(<LiveEditForm componentId={pongal} />);
    await userEvent.click(await readyButton('Save Base'));
    expect(screen.queryByText('Served with')).not.toBeInTheDocument();

    await waitFor(async () => expect(await getOwnedRule(sambar, 'serve:base_dish')).toEqual(before));
  });

  it('opens with its stored meals and days when the library is already loaded, and saving keeps them', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const pongal = await saveComponent(undefined, { name: 'Pongal', componentType: 'base', base_category_id: riceId, dietary_tags: ['veg'], regional_tags: [], occasion_tags: [], created_at: '' }, {
      allowed_meals: (c) => mealRule(c, ['breakfast']),
      allowed_days: (c) => dayRule(c, ['saturday', 'sunday']),
    });
    // As on the library page: the shared lookup has loaded before the form opens.
    function OpenWhenLoaded() {
      return useLibraryLookup().loaded ? <LiveEditForm componentId={pongal} /> : null;
    }
    render(<LibraryLookupProvider><OpenWhenLoaded /></LibraryLookupProvider>);

    expect(await screen.findByRole('checkbox', { name: 'breakfast' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Days' })).toHaveTextContent('Weekends');
    await userEvent.click(await readyButton('Save Base'));

    await waitFor(async () => {
      expect(ruleMeals((await getOwnedRule(pongal, 'allowed_meals'))!)).toEqual(['breakfast']);
      expect(ruleDays((await getOwnedRule(pongal, 'allowed_days'))!)).toEqual(['saturday', 'sunday']);
    });
  });

  it('writes days, meals and never-auto only when they were changed', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const pongal = await saveComponent(undefined, { name: 'Pongal', componentType: 'base', base_category_id: riceId, dietary_tags: ['veg'], regional_tags: [], occasion_tags: [], created_at: '' }, {
      allowed_meals: (c) => mealRule(c, ['breakfast']),
      allowed_days: (c) => dayRule(c, ['saturday', 'sunday']),
    });
    const save = vi.spyOn(foodDb, 'saveComponent');
    render(<LiveEditForm componentId={pongal} />);

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'breakfast' })).toBeChecked());
    await userEvent.type(screen.getByLabelText('Name'), ' Special');
    await userEvent.click(await readyButton('Save Base'));
    await waitFor(() => expect(save).toHaveBeenCalled());
    for (const key of ['allowed_meals', 'allowed_days', 'exclude']) expect(save.mock.calls[0][2]).not.toHaveProperty(key);
    save.mockRestore();

    // Changing one of them writes just that one.
    cleanup();
    const again = vi.spyOn(foodDb, 'saveComponent');
    render(<LiveEditForm componentId={pongal} />);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'breakfast' })).toBeChecked());
    await userEvent.click(screen.getByRole('checkbox', { name: 'dinner' }));
    await userEvent.click(await readyButton('Save Base'));
    await waitFor(() => expect(again).toHaveBeenCalled());
    expect(again.mock.calls[0][2]).toHaveProperty('allowed_meals');
    expect(again.mock.calls[0][2]).not.toHaveProperty('allowed_days');
    again.mockRestore();
    await waitFor(async () => expect(ruleMeals((await getOwnedRule(pongal, 'allowed_meals'))!)).toEqual(['breakfast', 'dinner']));
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

async function addLink(target: string, mode: 'Only with' | 'Never with' | 'Comes with', values: string[], strength?: string) {
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

  it('holds back Save while a link is being built, then saves it', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    // Ticking every category would mean no rule at all.
    await addCategory({ kind: 'base', name: 'Flatbreads' });
    render(<ComponentForm componentType="curry" mode="add" onSave={() => {}} onDiscard={() => {}} />);
    await userEvent.click(await readyButton('Add link'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Link to' }), 'Base categories');
    await userEvent.click(screen.getByRole('button', { name: 'Only with' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Rice Plates' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Sambar');
    expect(screen.getByRole('button', { name: 'Save Curry' })).toBeDisabled();
    expect(screen.getByText('Finish or cancel the link first.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('Finish or cancel the link first.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save Curry' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));
    await waitFor(async () => {
      const [sambar] = await getComponentsByType('curry');
      expect(await pairedBases(sambar.id)).toEqual([riceId]);
    });
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
    const curryId = await saveComponent(undefined, { name: 'Sambar', componentType: 'curry', ...tags }, {}, [
      { kind: 'add', link: { mode: 'with', target: 'base_category', values: [riceId], strength: 'always' } },
      { kind: 'add', link: { mode: 'never', target: 'curry_category', values: ['soup'], strength: 'always' } },
    ]);

    render(<LiveEditForm componentId={curryId} />);
    const item = await screen.findByText(/planned only with Rice Plates/);
    await userEvent.click(await readyButton('Remove', item.closest('li')!));
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(async () => expect(await pairedBases(curryId)).toBeUndefined());
    expect(await getOwnedRule(curryId, 'never:curry_category')).toBeDefined();
  });

  it('lists rules from the Rules page that mention the dish', async () => {
    const dishId = await saveComponent(undefined, { name: 'Sambar', componentType: 'curry', ...tags }, {});
    const rule = (name: string, enabled: boolean, owner?: number) => ({
      name, enabled, created_at: new Date().toISOString(), owner_component_id: owner,
      spec: { template: 'exclude', params: { match: is('id', dishId) } },
    }) as never;
    const onId = await db.rules.add(rule('No sambar', true));
    const offId = await db.rules.add(rule('Skip sambar', false));
    const ownedId = await db.rules.add(rule('Owned by dish', true, dishId));
    // Another dish's own link that names this one is part of that dish's links, not a hand-written rule.
    const otherId = await saveComponent(undefined, { name: 'Idli', componentType: 'base', ...tags }, {});
    const otherOwnedId = await db.rules.add(rule('Owned by Idli', true, otherId));

    render(<LiveEditForm componentId={dishId} />);
    const section = (await screen.findByText('Other rules mentioning this dish')).parentElement!;
    const links = within(section).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([`/rules#rule-${onId}`, `/rules#rule-${offId}`]);
    expect(within(section).getByText(/\(off\)/)).toBeInTheDocument();
    expect(within(section).queryByRole('link', { name: /Owned/ })).toBeNull();
    expect(section.innerHTML).not.toContain(`rule-${ownedId}`);
    expect(section.innerHTML).not.toContain(`rule-${otherOwnedId}`);
  });

  it('does not prefill a new dish from hand-written rules', async () => {
    const hand = (spec: unknown) => ({ name: 'Hand', enabled: true, created_at: new Date().toISOString(), spec }) as never;
    await db.rules.add(hand({ template: 'exclude', params: { match: is('id', 999) } }));
    await db.rules.add(hand({ template: 'allowed_days', params: { match: is('id', 999), days: ['Sat'] } }));

    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const pairing = { ...pairingRule({ id: 999, name: 'Other' }, [riceId]), owner_component_id: undefined };
    await db.rules.add({ ...pairing, enabled: true, created_at: new Date().toISOString() } as never);

    render(<ComponentForm componentType="curry" mode="add" onSave={() => {}} onDiscard={() => {}} />);
    await readyButton('Add link');
    expect(screen.queryByText('View rule')).toBeNull();
    expect(screen.queryByText(/only with Rice Plates/)).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Never plan automatically' })).not.toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Days' })).toHaveTextContent('Any day');
    await userEvent.type(screen.getByLabelText('Name'), 'Rasam');
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));
    await waitFor(async () => expect((await getComponentsByType('curry')).length).toBe(1));
    const [rasam] = await getComponentsByType('curry');
    expect(await foodDb.getOwnedRules(rasam.id)).toEqual([]);
  });

  it('saving without touching links writes no link rule changes', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const curryId = await saveComponent(undefined, { name: 'Sambar', componentType: 'curry', ...tags }, {}, [
      { kind: 'add', link: { mode: 'with', target: 'base_category', values: [riceId], strength: 'moderately' } },
      { kind: 'add', link: { mode: 'never', target: 'curry_category', values: ['soup'], strength: 'always' } },
    ]);
    // A hand-edited cost reads back as "often" but must not be rewritten as 6.
    const stored = (await getOwnedRule(curryId, 'with:base_category'))!;
    await db.rules.update(stored.id, { spec: { ...stored.spec, params: { ...stored.spec.params, cost: 5 } } as typeof stored.spec });
    const save = vi.spyOn(foodDb, 'saveComponent');

    render(<LiveEditForm componentId={curryId} />);
    expect(await screen.findByText(/often planned only with Rice Plates/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][3] ?? []).toEqual([]);
    expect((await getOwnedRule(curryId, 'with:base_category'))?.spec.params).toMatchObject({ strength: 'prefer', cost: 5 });
  });

  it('saves only the links that changed', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const curryId = await saveComponent(undefined, { name: 'Sambar', componentType: 'curry', ...tags }, {}, [
      { kind: 'add', link: { mode: 'with', target: 'base_category', values: [riceId], strength: 'moderately' } },
    ]);
    const stored = (await getOwnedRule(curryId, 'with:base_category'))!;
    await db.rules.update(stored.id, { spec: { ...stored.spec, params: { ...stored.spec.params, cost: 5 } } as typeof stored.spec });

    render(<LiveEditForm componentId={curryId} />);
    await screen.findByText(/often planned only with Rice Plates/);
    await addLink('Curry types', 'Never with', ['soup']);
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(async () => expect(await getOwnedRule(curryId, 'never:curry_category')).toBeDefined());
    expect((await getOwnedRule(curryId, 'with:base_category'))?.spec.params).toMatchObject({ strength: 'prefer', cost: 5 });
  });

  it('marks a switched-off link, and switches it on once it is changed and saved', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    await addCategory({ kind: 'base', name: 'Flatbreads' });
    await addCategory({ kind: 'base', name: 'Millets' });
    const curryId = await saveComponent(undefined, { name: 'Sambar', componentType: 'curry', ...tags }, {}, [
      { kind: 'add', link: { mode: 'with', target: 'base_category', values: [riceId], strength: 'always' } },
      { kind: 'add', link: { mode: 'never', target: 'curry_category', values: ['soup'], strength: 'always' } },
    ]);
    for (const slot of ['with:base_category', 'never:curry_category'] as const) {
      await db.rules.update((await getOwnedRule(curryId, slot))!.id, { enabled: false });
    }

    render(<LiveEditForm componentId={curryId} />);
    const pairing = (await screen.findByText(/planned only with Rice Plates/)).closest('li')!;
    expect(pairing).toHaveTextContent('(off)');
    expect((await screen.findByText(/kept away from soup/)).closest('li')).toHaveTextContent('(off)');
    await userEvent.click(await readyButton('Edit', pairing));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Flatbreads' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect((await screen.findByText(/planned only with Rice Plates/)).closest('li')).not.toHaveTextContent('(off)');
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(async () => expect((await getOwnedRule(curryId, 'with:base_category'))?.enabled).toBe(true));
    expect(await pairedBases(curryId)).toHaveLength(2);
    expect((await getOwnedRule(curryId, 'never:curry_category'))?.enabled).toBe(false);
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

describe('ComponentForm links: several of one kind', () => {
  async function setup() {
    const coconut = await saveComponent(undefined, { name: 'Coconut Chutney', componentType: 'extra', ...tags });
    const tomato = await saveComponent(undefined, { name: 'Tomato Chutney', componentType: 'extra', ...tags });
    const comes = (values: number[]): DishLink => ({ mode: 'comes', target: 'extra_dish', values, strength: 'always' });
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const idli = await saveComponent(undefined, { name: 'Idli', componentType: 'base', base_category_id: riceId, ...tags }, {}, [
      { kind: 'add', link: comes([coconut]) }, { kind: 'add', link: comes([tomato]) },
    ]);
    return { idli, before: await foodDb.getOwnedRules(idli) };
  }

  async function saveUntouched(idli: number, before: unknown) {
    expect(await screen.findByText(/Idli always comes with Coconut Chutney/)).toBeInTheDocument();
    expect(screen.getByText(/Idli always comes with Tomato Chutney/)).toBeInTheDocument();
    const save = vi.spyOn(foodDb, 'saveComponent');
    await userEvent.click(await readyButton('Save Base'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][3] ?? []).toEqual([]);
    save.mockRestore();
    expect(await foodDb.getOwnedRules(idli)).toEqual(before);
  }

  it('shows both links and saves neither when untouched, opened before the library loads', async () => {
    const { idli, before } = await setup();
    render(<LiveEditForm componentId={idli} />);
    await saveUntouched(idli, before);
  });

  it('shows both links and saves neither when untouched, opened once loaded', async () => {
    const { idli, before } = await setup();
    function OpenWhenLoaded() {
      return useLibraryLookup().loaded ? <LiveEditForm componentId={idli} /> : null;
    }
    render(<LibraryLookupProvider><OpenWhenLoaded /></LibraryLookupProvider>);
    await saveUntouched(idli, before);
  });

  it('removing one link deletes only its rule', async () => {
    const { idli, before } = await setup();
    render(<LiveEditForm componentId={idli} />);
    const item = (await screen.findByText(/Idli always comes with Coconut Chutney/)).closest('li')!;
    await userEvent.click(await readyButton('Remove', item));
    await userEvent.click(screen.getByRole('button', { name: 'Save Base' }));
    await waitFor(async () => expect(await foodDb.getOwnedRules(idli)).toEqual([before[1]]));
  });
});

describe('ComponentForm links: comes with', () => {
  afterEach(() => vi.restoreAllMocks());

  const OLD = '2020-01-01T00:00:00.000Z';

  /** Idli comes with two chutneys, and keeps an old only-with link to specific curries and a never-with link. */
  async function setup() {
    const coconut = await saveComponent(undefined, { name: 'Coconut Chutney', componentType: 'extra', ...tags });
    const tomato = await saveComponent(undefined, { name: 'Tomato Chutney', componentType: 'extra', ...tags });
    const mint = await saveComponent(undefined, { name: 'Mint Chutney', componentType: 'extra', ...tags });
    const sambar = await saveComponent(undefined, { name: 'Sambar', componentType: 'curry', ...tags });
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const comes = (values: number[]): DishLink => ({ mode: 'comes', target: 'extra_dish', values, strength: 'always' });
    const idli = await saveComponent(undefined, { name: 'Idli', componentType: 'base', base_category_id: riceId, ...tags }, {}, [
      { kind: 'add', link: comes([coconut]) },
      { kind: 'add', link: comes([tomato]) },
      { kind: 'add', link: { mode: 'with', target: 'curry_dish', values: [sambar], strength: 'usually' } },
      { kind: 'add', link: { mode: 'never', target: 'curry_category', values: ['soup'], strength: 'always' } },
    ]);
    // A known, old creation time shows an edit updates the rule rather than replacing it.
    for (const rule of await foodDb.getOwnedRules(idli)) await db.rules.update(rule.id, { created_at: OLD });
    return { idli, coconut, tomato, mint, sambar, before: await foodDb.getOwnedRules(idli) };
  }

  const loadOrders = [
    ['before the library loads', (id: number) => render(<LiveEditForm componentId={id} />)],
    ['once the library has loaded', (id: number) => {
      function OpenWhenLoaded() {
        return useLibraryLookup().loaded ? <LiveEditForm componentId={id} /> : null;
      }
      return render(<LibraryLookupProvider><OpenWhenLoaded /></LibraryLookupProvider>);
    }],
  ] as const;

  const itemOf = async (text: RegExp) => (await screen.findByText(text)).closest('li')!;

  it.each(loadOrders)('a save with no edits writes no link rule, opened %s', async (_, open) => {
    const { idli, before } = await setup();
    open(idli);
    expect(await itemOf(/Idli always comes with Coconut Chutney/)).toBeInTheDocument();
    expect(await itemOf(/usually planned only with Sambar/)).toHaveTextContent('(only limits: edit it to have it come with the meal)');
    const save = vi.spyOn(foodDb, 'saveComponent');
    await userEvent.click(await readyButton('Save Base'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][3] ?? []).toEqual([]);
    expect(await foodDb.getOwnedRules(idli)).toEqual(before);
  });

  it.each(loadOrders)('Add link offers Comes with again for a kind already used, opened %s', async (_, open) => {
    const { idli, before, mint } = await setup();
    open(idli);
    await userEvent.click(await readyButton('Add link'));
    const linkTo = screen.getByRole('combobox', { name: 'Link to' });
    await userEvent.selectOptions(linkTo, 'Specific extras');
    expect(screen.getByRole('button', { name: 'Comes with' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Only with' })).toBeNull();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Mint Chutney' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save Base' }));

    await waitFor(async () => expect(await foodDb.getOwnedRules(idli)).toHaveLength(before.length + 1));
    const after = await foodDb.getOwnedRules(idli);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(readLink(after[before.length])).toEqual({ mode: 'comes', target: 'extra_dish', values: [mint], strength: 'always' });
  });

  it.each(loadOrders)('two comes-with links are edited independently, opened %s', async (_, open) => {
    const { idli, before, tomato, mint } = await setup();
    open(idli);
    const second = await itemOf(/Idli always comes with Tomato Chutney/);
    await userEvent.click(await readyButton('Edit', second));
    // Only the link clicked opens.
    expect(screen.getAllByRole('button', { name: 'Done' })).toHaveLength(1);
    expect(screen.getByText(/Idli always comes with Coconut Chutney/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Mint Chutney' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save Base' }));

    const edited = before.find((r) => readLink(r)?.values.includes(tomato))!;
    await waitFor(async () => expect(readLink((await db.rules.get(edited.id))!)?.values).toEqual([tomato, mint]));
    const after = await foodDb.getOwnedRules(idli);
    // An update: same rule id and creation time; every other rule as it was.
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
    expect(after.find((r) => r.id === edited.id)?.created_at).toBe(OLD);
    expect(after.filter((r) => r.id !== edited.id)).toEqual(before.filter((r) => r.id !== edited.id));
  });

  it('opening an old only-with link and saving stores it as comes with', async () => {
    const { idli, before, sambar } = await setup();
    render(<LiveEditForm componentId={idli} />);
    const old = before.find((r) => r.spec.template === 'avoid_with' && readLink(r)?.mode === 'with')!;
    await userEvent.click(await readyButton('Edit', await itemOf(/usually planned only with Sambar/)));
    expect(screen.getByRole('button', { name: 'Comes with' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Only with' })).toBeNull();
    expect(screen.getByText('Idli usually comes with Sambar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await itemOf(/Idli usually comes with Sambar/)).not.toHaveTextContent('only limits');
    await userEvent.click(screen.getByRole('button', { name: 'Save Base' }));

    await waitFor(async () => expect((await db.rules.get(old.id))?.spec.template).toBe('comes_with'));
    const stored = (await db.rules.get(old.id))!;
    expect(readLink(stored)).toEqual({ mode: 'comes', target: 'curry_dish', values: [sambar], strength: 'usually' });
    expect(stored.created_at).toBe(OLD);
    const after = await foodDb.getOwnedRules(idli);
    expect(after.filter((r) => r.id !== old.id)).toEqual(before.filter((r) => r.id !== old.id));
  });

  it('the strength row is labelled How firmly', async () => {
    render(<ComponentForm componentType="curry" mode="add" onSave={() => {}} onDiscard={() => {}} />);
    await userEvent.click(await readyButton('Add link'));
    expect(screen.getByText('How firmly')).toBeVisible();
    expect(within(screen.getByRole('group', { name: 'How firmly' })).getByRole('button', { name: 'Always' })).toBeInTheDocument();
  });
});

describe('ComponentForm draft prefill', () => {
  it('saves a drafted served-with link together with the new dish', async () => {
    await addCategory({ kind: 'extra', name: 'Condiment' });
    const idli = await saveComponent(undefined, { name: 'Idli', componentType: 'base', dietary_tags: ['veg'], regional_tags: [], occasion_tags: [], created_at: '' });
    render(
      <ComponentForm
        componentType="extra"
        mode="add"
        draft={{ name: 'Coconut Chutney', componentType: 'extra' }}
        draftLinks={[{ mode: 'serve', target: 'base_dish', values: [idli], strength: 'usually' }]}
        onSave={() => {}}
        onDiscard={() => {}}
      />,
    );

    expect(await screen.findByText(/Coconut Chutney is usually served with Idli/)).toBeInTheDocument();
    await userEvent.click(await readyButton('Save Extra'));

    await waitFor(async () => {
      const [chutney] = await getComponentsByType('extra');
      const rule = await getOwnedRule(chutney.id, 'serve:base_dish');
      expect(rule && readLink(rule)).toEqual({ mode: 'serve', target: 'base_dish', values: [idli], strength: 'usually' });
    });
  });

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

  it('merges drafted links over a dish\'s stored links and saves only those', async () => {
    const curryId = await saveComponent(undefined, { name: 'Sambar', componentType: 'curry', ...tags }, {}, [
      { kind: 'add', link: { mode: 'never', target: 'curry_category', values: ['soup'], strength: 'always' } },
    ]);
    const stored = (await getOwnedRule(curryId, 'never:curry_category'))!;
    await db.rules.update(stored.id, { spec: { ...stored.spec, params: { ...stored.spec.params, cost: 5 } } as typeof stored.spec });
    const idli = await saveComponent(undefined, { name: 'Idli', componentType: 'base', ...tags });
    const save = vi.spyOn(foodDb, 'saveComponent');

    render(<LiveEditForm componentId={curryId} draftLinks={[{ mode: 'serve', target: 'base_dish', values: [idli], strength: 'always' }]} />);
    expect(await screen.findByText(/Sambar is always served with Idli/)).toBeInTheDocument();
    expect(await screen.findByText(/Sambar is always kept away from soup/)).toBeInTheDocument();
    await userEvent.click(await readyButton('Save Curry'));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][3]).toEqual([{ kind: 'add', link: { mode: 'serve', target: 'base_dish', values: [idli], strength: 'always' } }]);
    await waitFor(async () => {
      const rule = await getOwnedRule(curryId, 'serve:base_dish');
      expect(rule && readLink(rule)).toEqual({ mode: 'serve', target: 'base_dish', values: [idli], strength: 'always' });
    });
    expect((await getOwnedRule(curryId, 'never:curry_category'))?.spec.params).toMatchObject({ cost: 5 });
  });

  it('switches on a switched-off link that a drafted link replaces, even an identical one', async () => {
    const idli = await saveComponent(undefined, { name: 'Idli', componentType: 'base', ...tags });
    const curryId = await saveComponent(undefined, { name: 'Sambar', componentType: 'curry', ...tags }, {}, [
      { kind: 'add', link: { mode: 'serve', target: 'base_dish', values: [idli], strength: 'always' } },
    ]);
    await db.rules.update((await getOwnedRule(curryId, 'serve:base_dish'))!.id, { enabled: false });

    render(<LiveEditForm componentId={curryId} draftLinks={[{ mode: 'serve', target: 'base_dish', values: [idli], strength: 'always' }]} />);
    expect((await screen.findByText(/Sambar is always served with Idli/)).closest('li')).not.toHaveTextContent('(off)');
    await userEvent.click(await readyButton('Save Curry'));

    await waitFor(async () => expect((await getOwnedRule(curryId, 'serve:base_dish'))?.enabled).toBe(true));
  });

  it('merges a drafted served-with link into the enabled link of its slot, not a switched-off one', async () => {
    const idli = await saveComponent(undefined, { name: 'Idli', componentType: 'base', ...tags });
    const dosa = await saveComponent(undefined, { name: 'Dosa', componentType: 'base', ...tags });
    const pongal = await saveComponent(undefined, { name: 'Pongal', componentType: 'base', ...tags });
    const curryId = await saveComponent(undefined, { name: 'Sambar', componentType: 'curry', ...tags });
    const owner = { id: curryId, name: 'Sambar' };
    // The switched-off link has the lower id, so a lowest-id pick would land on it.
    const offId = await db.rules.add({ ...linkRule(owner, { mode: 'serve', target: 'base_dish', values: [pongal] }), enabled: false, owner_component_id: curryId, created_at: '' } as RuleRecord) as number;
    const onId = await db.rules.add({ ...linkRule(owner, { mode: 'serve', target: 'base_dish', values: [idli] }), enabled: true, owner_component_id: curryId, created_at: '' } as RuleRecord) as number;

    render(<LiveEditForm componentId={curryId} draftLinks={[{ mode: 'serve', target: 'base_dish', values: [idli, dosa], strength: 'always' }]} />);
    await userEvent.click(await readyButton('Save Curry'));

    await waitFor(async () => expect(readLink((await db.rules.get(onId))!)).toMatchObject({ values: [idli, dosa] }));
    const off = (await db.rules.get(offId))!;
    expect(off.enabled).toBe(false);
    expect(readLink(off)).toMatchObject({ values: [pongal] });
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

describe('ComponentForm links: one always curry per base', () => {
  async function setup() {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    const idli = await saveComponent(undefined, { name: 'Idli', componentType: 'base', base_category_id: riceId, ...tags }, {});
    await saveComponent(undefined, { name: 'Sambar', componentType: 'curry', ...tags }, {}, [
      { kind: 'add', link: { mode: 'serve', target: 'base_dish', values: [idli], strength: 'always' } },
    ]);
    return saveComponent(undefined, { name: 'Rasam', componentType: 'curry', ...tags }, {});
  }

  async function addAlwaysServe() {
    await userEvent.click(await readyButton('Add link'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Link to' }), 'Specific bases');
    await userEvent.click(screen.getByRole('button', { name: 'Served with' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Idli' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
  }

  async function expectGuard() {
    expect(await screen.findByText('Sambar is already always served with Idli, and a meal holds one curry.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Curry' })).toBeDisabled();
    await userEvent.click(await readyButton('Edit'));
    await userEvent.click(screen.getByRole('button', { name: 'Usually' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Curry' })).toBeEnabled());
  }

  it('blocks Save for a second always curry, opened before the library loads', async () => {
    const rasam = await setup();
    render(<LiveEditForm componentId={rasam} />);
    await addAlwaysServe();
    await expectGuard();
  });

  it('blocks Save for a second always curry, opened once the library has loaded', async () => {
    const rasam = await setup();
    function OpenWhenLoaded() {
      return useLibraryLookup().loaded ? <LiveEditForm componentId={rasam} /> : null;
    }
    render(<LibraryLookupProvider><OpenWhenLoaded /></LibraryLookupProvider>);
    await addAlwaysServe();
    await expectGuard();
  });

  async function setupStoredConflict() {
    const rasam = await setup();
    const idli = (await db.components.toArray()).find((c) => c.name === 'Idli')!.id!;
    await saveComponent(rasam, { name: 'Rasam', componentType: 'curry', ...tags }, {}, [
      { kind: 'add', link: { mode: 'serve', target: 'base_dish', values: [idli], strength: 'always' } },
    ]);
    return rasam;
  }

  async function renameAndExpectEnabled() {
    expect(await screen.findByText(/Sambar is already always served with Idli/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: /name/i }), 'x');
    expect(screen.getByRole('button', { name: 'Save Curry' })).toBeEnabled();
  }

  it('keeps Save enabled for an unrelated edit when the conflict is already stored, opened before the library loads', async () => {
    const rasam = await setupStoredConflict();
    render(<LiveEditForm componentId={rasam} />);
    await renameAndExpectEnabled();
  });

  it('keeps Save enabled for an unrelated edit when the conflict is already stored, opened once loaded', async () => {
    const rasam = await setupStoredConflict();
    function OpenWhenLoaded() {
      return useLibraryLookup().loaded ? <LiveEditForm componentId={rasam} /> : null;
    }
    render(<LibraryLookupProvider><OpenWhenLoaded /></LibraryLookupProvider>);
    await renameAndExpectEnabled();
  });
});
