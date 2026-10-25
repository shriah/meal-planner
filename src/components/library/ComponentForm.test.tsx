/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLiveQuery } from 'dexie-react-hooks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { addCategory, deleteCategory, renameCategory } from '@/services/category-db';
import { clashCurryCategories, pairingCategories, pairingRule, ruleDays } from '@/rules';
import { getComponentsByType, getOwnedRule, saveComponent } from '@/services/food-db';
import { ComponentForm } from './ComponentForm';
import { ComponentRow } from './ComponentRow';

const pairedBases = async (id: number) => {
  const rule = await getOwnedRule(id, 'pairs_with');
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

  it('reuses the compatible-base checklist when creating a curry and persists selected base category ids', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });
    await addCategory({ kind: 'base', name: 'Flatbreads' });

    render(
      <ComponentForm
        componentType="curry"
        mode="add"
        onSave={() => {}}
        onDiscard={() => {}}
      />,
    );

    expect(await screen.findByText('Compatible Base Categories')).toBeInTheDocument();
    expect(await screen.findByText('Rice Plates')).toBeInTheDocument();
    expect(await screen.findByText('Flatbreads')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Rice Plates'));
    await userEvent.type(screen.getByLabelText('Name'), 'Sambar');
    await userEvent.click(screen.getByRole('button', { name: 'Save Curry' }));

    await waitFor(async () => {
      const curries = await getComponentsByType('curry');
      expect(curries).toHaveLength(1);
      expect(await pairedBases(curries[0].id)).toEqual([riceId]);
    });
  });

  it('lets a curry with no bases chosen go with any base, and marks one never planned automatically', async () => {
    await addCategory({ kind: 'base', name: 'Rice Plates' });

    render(<ComponentForm componentType="curry" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    expect(await screen.findByText(/goes with any base/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Never plan automatically' }));
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
    }, { pairs_with: (c) => pairingRule(c, [riceId]) });

    render(
      <>
        <LiveEditForm componentId={curryId} />
        <LiveComponentRow componentId={curryId} />
      </>,
    );

    expect(await screen.findAllByText('Rice-based')).not.toHaveLength(0);
    expect(screen.getByText('Flatbreads')).toBeInTheDocument();

    await renameCategory(riceId, 'Steamed rice');
    await renameCategory(breadId, 'Rotis');

    // Each rename is a separate write with its own live-query update, so wait for both.
    await waitFor(() => {
      expect(screen.getAllByText('Steamed rice').length).toBeGreaterThan(0);
      expect(screen.getByText('Rotis')).toBeInTheDocument();
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
    }, { pairs_with: (c) => pairingRule(c, [riceId]) });

    render(<LiveEditForm componentId={curryId} />);

    expect(await screen.findByText('Rice-based')).toBeInTheDocument();

    await deleteCategory(riceId);

    await waitFor(() => {
      expect(screen.getByText(/goes with any base/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Rice-based')).not.toBeInTheDocument();
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

  it('gives a subzi a base pairing only when bases are chosen', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'Rice Plates' });

    render(<ComponentForm componentType="subzi" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    expect(await screen.findByText(/goes with any base/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Name'), 'Beans');
    await userEvent.click(screen.getByRole('button', { name: 'Save Subzi' }));
    await waitFor(async () => expect(await getComponentsByType('subzi')).toHaveLength(1));
    const [beans] = await getComponentsByType('subzi');
    expect(await getOwnedRule(beans.id, 'pairs_with')).toBeUndefined();

    cleanup();
    render(<ComponentForm componentType="subzi" mode="add" onSave={() => {}} onDiscard={() => {}} />);
    await userEvent.click(await screen.findByText('Rice Plates'));
    await userEvent.type(screen.getByLabelText('Name'), 'Bhindi');
    await userEvent.click(screen.getByRole('button', { name: 'Save Subzi' }));

    await waitFor(async () => {
      const bhindi = (await getComponentsByType('subzi')).find((c) => c.name === 'Bhindi')!;
      expect(await pairedBases(bhindi.id)).toEqual([riceId]);
    });
  });

  it('saves the curry types an extra never goes with as a rule it owns', async () => {
    await addCategory({ kind: 'extra', name: 'Crunchy' });

    render(<ComponentForm componentType="extra" mode="add" onSave={() => {}} onDiscard={() => {}} />);

    await userEvent.click(await screen.findByText('soup'));
    await userEvent.type(screen.getByLabelText('Name'), 'Papad');
    await userEvent.click(screen.getByRole('button', { name: 'Save Extra' }));

    await waitFor(async () => {
      const [papad] = await getComponentsByType('extra');
      const rule = await getOwnedRule(papad.id, 'avoid_with');
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
