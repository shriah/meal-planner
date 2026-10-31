/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { ownedChanges } from '@/rules';
import { saveActivePlan } from '@/services/plan-db';
import type { PlanningInput, PlanningOptions, PlanningOutcome } from '@/services/plan-generation';
import { usePlanStore } from '@/stores/plan-store';
import type { ComponentRecord } from '@/types/component';
import type { WeeklyPlan } from '@/types/plan';
import { LinkPreview } from './LinkPreview';

const dish = (id: number, name: string, componentType: string) =>
  ({ id, name, componentType, dietary_tags: ['veg'], regional_tags: [], occasion_tags: [], created_at: '' } as ComponentRecord);

const week = (curry_id: number): WeeklyPlan => ({ slots: [{ day: 'monday', meal_slot: 'lunch', base_id: 1, curry_id, extra_ids: [] }] } as WeeklyPlan);

/** Plans Paneer unless the dish owns an exclude rule; records what it was asked to plan. */
function stubRun() {
  const calls: { input: PlanningInput; opts: PlanningOptions }[] = [];
  const run = async (input: PlanningInput, opts: PlanningOptions): Promise<PlanningOutcome> => {
    calls.push({ input, opts });
    const excluded = input.rules.some((r) => r.owner_component_id === 2 && r.spec.template === 'exclude');
    return { plan: week(excluded ? 3 : 2), problems: [], ruleIssues: [] } as PlanningOutcome;
  };
  return { run, calls };
}

const NONE = { days: [], meals: [], neverAuto: false };

afterEach(() => cleanup());

beforeEach(async () => {
  await db.components.clear();
  await db.rules.clear();
  await db.active_plan.clear();
  // The plan store is a module singleton; start every test unhydrated.
  usePlanStore.setState({ plan: null, locks: {}, hydrated: false });
  await db.components.bulkAdd([dish(1, 'Pulao', 'base'), dish(2, 'Paneer', 'curry'), dish(3, 'Dal', 'curry')]);
});

describe('LinkPreview', () => {
  it('shows the week before and after the unsaved changes, planned around the locks', async () => {
    await saveActivePlan({ plan: week(2), locks: { 'monday-lunch-base': true } });
    const { run, calls } = stubRun();
    const changes = ownedChanges('curry', { ...NONE, neverAuto: true });
    render(<LinkPreview dishId={2} dishName="Paneer" changes={changes} run={run} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Preview on this week' }));

    expect(await screen.findByRole('table', { name: 'After' })).toHaveTextContent('Pulao, Dal');
    expect(screen.getByRole('table', { name: 'Before' })).toHaveTextContent('Pulao, Paneer');
    expect(screen.getByText(/1 meal changes/)).toBeInTheDocument();
    expect(calls).toHaveLength(2);
    expect(calls[0].opts.pins).toEqual({ 'monday-lunch': { base_id: 1 } });
    expect(calls[1].input.rules.some((r) => r.id === -1)).toBe(true);
  });

  it('says so when the changes would not change the week', async () => {
    await saveActivePlan({ plan: week(2), locks: {} });
    const { run } = stubRun();
    render(<LinkPreview dishId={2} dishName="Paneer" changes={{}} run={run} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Preview on this week' }));

    expect(await screen.findByText('This would not change the week.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('is absent in add mode', async () => {
    await saveActivePlan({ plan: week(2), locks: {} });
    render(<LinkPreview dishId={undefined} dishName="New" changes={{}} run={stubRun().run} />);
    await waitFor(() => expect(usePlanStore.getState().hydrated).toBe(true));
    expect(screen.queryByRole('button', { name: 'Preview on this week' })).not.toBeInTheDocument();
  });

  it('is absent when there is no plan', async () => {
    render(<LinkPreview dishId={2} dishName="Paneer" changes={{}} run={stubRun().run} />);
    await waitFor(() => expect(usePlanStore.getState().hydrated).toBe(true));
    expect(screen.queryByRole('button', { name: 'Preview on this week' })).not.toBeInTheDocument();
  });
});
