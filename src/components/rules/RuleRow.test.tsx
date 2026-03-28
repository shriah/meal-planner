/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLiveQuery } from 'dexie-react-hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from 'sonner';
import { RuleRow } from './RuleRow';
import type { RuleRecord } from '@/db/client';
import { db } from '@/db/client';
import * as foodDbService from '@/services/food-db';
import { addComponent, addRule, getRules } from '@/services/food-db';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  await db.components.clear();
  await db.rules.clear();
});

async function seedComponents() {
  await addComponent({
    name: 'Plain Rice',
    componentType: 'base',
    base_type: 'rice-based',
    dietary_tags: ['veg'],
    regional_tags: ['pan-indian'],
    occasion_tags: ['everyday'],
    created_at: '',
  });
  await addComponent({
    name: 'Sambar',
    componentType: 'curry',
    dietary_tags: ['veg'],
    protein_tag: 'dal',
    regional_tags: ['south-indian'],
    occasion_tags: ['everyday'],
    created_at: '',
  });
  await addComponent({
    name: 'Beans Poriyal',
    componentType: 'subzi',
    compatible_base_types: ['rice-based'],
    dietary_tags: ['veg'],
    regional_tags: ['south-indian'],
    occasion_tags: ['everyday'],
    created_at: '',
  });
}

async function seedRule(): Promise<RuleRecord> {
  const id = await addRule({
    name: 'Fish Fridays',
    enabled: true,
    created_at: '2026-03-27T00:00:00.000Z',
    compiled_filter: {
      type: 'rule',
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      scope: { days: ['friday'], slots: ['dinner'] },
      effects: [{ kind: 'require_one' }],
    },
  });

  return {
    id,
    name: 'Fish Fridays',
    enabled: true,
    created_at: '2026-03-27T00:00:00.000Z',
    compiled_filter: {
      type: 'rule',
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      scope: { days: ['friday'], slots: ['dinner'] },
      effects: [{ kind: 'require_one' }],
    },
  };
}

function LiveRuleRow({ ruleId }: { ruleId: number }) {
  const rules = useLiveQuery(() => getRules(), [], []);
  const rule = rules.find((candidate) => candidate.id === ruleId);

  if (!rule) {
    return null;
  }

  return <RuleRow rule={rule} />;
}

describe('RuleRow edit flow', () => {
  it('opens edit sheet with the selected rule values preloaded', async () => {
    await seedComponents();
    const rule = await seedRule();

    render(
      <>
        <LiveRuleRow ruleId={rule.id!} />
        <Toaster />
      </>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Edit rule' }));

    expect(await screen.findByRole('heading', { name: 'Edit Rule' })).toBeInTheDocument();
    expect(screen.getByText('Changes are saved when you click Save Rule.')).toBeInTheDocument();
    expect(screen.getByLabelText('Rule name')).toHaveValue('Fish Fridays');
    expect(screen.getByRole('radio', { name: /By tag/i })).toBeChecked();
    expect(screen.getByRole('button', { name: 'fish' })).toHaveAttribute('data-state', 'on');
    expect(screen.queryByText('Exclude extra categories')).not.toBeInTheDocument();
    expect(screen.getByText('Require extra categories')).toBeInTheDocument();
  });

  it('saves edits by overwriting the existing rule instead of creating a second record', async () => {
    await seedComponents();
    const rule = await seedRule();

    render(
      <>
        <LiveRuleRow ruleId={rule.id!} />
        <Toaster />
      </>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Edit rule' }));
    const nameInput = await screen.findByLabelText('Rule name');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Friday fish dinner');
    await userEvent.click(screen.getByRole('button', { name: 'Save Rule' }));

    await waitFor(async () => {
      const rules = await getRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe(rule.id);
      expect(rules[0].name).toBe('Friday fish dinner');
    });

    expect(await screen.findByText('Friday fish dinner')).toBeInTheDocument();
  });

  it('discards abandoned edits and rehydrates original values after discard, Escape, and close button', async () => {
    await seedComponents();
    const rule = await seedRule();
    const updateRuleSpy = vi.spyOn(foodDbService, 'updateRule');

    render(
      <>
        <LiveRuleRow ruleId={rule.id!} />
        <Toaster />
      </>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Edit rule' }));
    const nameInput = await screen.findByLabelText('Rule name');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Discarded rename');
    await userEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Edit Rule' })).not.toBeInTheDocument();
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Edit rule' }));
    expect(await screen.findByLabelText('Rule name')).toHaveValue('Fish Fridays');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Edit Rule' })).not.toBeInTheDocument();
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Edit rule' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Edit Rule' })).not.toBeInTheDocument();
    });

    expect(updateRuleSpy).not.toHaveBeenCalled();
  });

  it('keeps the sheet open and emits Failed to save rule. Please try again. when updateRule rejects', async () => {
    await seedComponents();
    const rule = await seedRule();
    const updateRuleSpy = vi
      .spyOn(foodDbService, 'updateRule')
      .mockRejectedValueOnce(new Error('write failed'));

    render(
      <>
        <LiveRuleRow ruleId={rule.id!} />
        <Toaster />
      </>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Edit rule' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save Rule' }));

    await waitFor(() => {
      expect(updateRuleSpy).toHaveBeenCalled();
    });

    expect(screen.getByRole('heading', { name: 'Edit Rule' })).toBeInTheDocument();
    expect(await screen.findByText('Failed to save rule. Please try again.')).toBeInTheDocument();
  });
});
