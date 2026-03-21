import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/client';
import { usePlanStore } from './plan-store';
import { saveActivePlan } from '@/services/plan-db';
import type { WeeklyPlan } from '@/types/plan';

// ─── Helper: make a minimal valid WeeklyPlan ───────────────────────────────────

function makePlan(): WeeklyPlan {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
  const slots = ['breakfast', 'lunch', 'dinner'] as const;
  return {
    slots: days.flatMap(day =>
      slots.map(meal_slot => ({
        day,
        meal_slot,
        base_id: 1,
        extra_ids: [],
      })),
    ),
  };
}

// ─── beforeEach: reset store + clear DB ───────────────────────────────────────

beforeEach(async () => {
  await db.active_plan.clear();
  // Reset store to initial state
  usePlanStore.setState({
    plan: null,
    locks: {},
    warnings: [],
    isGenerating: false,
    hydrated: false,
    warningBannerDismissed: false,
  });
});

// ─── Store tests ──────────────────────────────────────────────────────────────

describe('plan-store', () => {
  it('setLock sets a lock key to true and persists to Dexie', async () => {
    const plan = makePlan();
    usePlanStore.setState({ plan });

    usePlanStore.getState().setLock('monday-breakfast-base', true);

    expect(usePlanStore.getState().locks['monday-breakfast-base']).toBe(true);

    // Wait for async save to complete (setLock fires saveActivePlan but doesn't await)
    await new Promise(resolve => setTimeout(resolve, 10));

    const record = await db.active_plan.get('current');
    expect(record).toBeDefined();
    expect(record!.locks['monday-breakfast-base']).toBe(true);
  });

  it('lockDay sets all 12 lock keys for that day to true', () => {
    const plan = makePlan();
    usePlanStore.setState({ plan });

    usePlanStore.getState().lockDay('tuesday');

    const locks = usePlanStore.getState().locks;
    const slots = ['breakfast', 'lunch', 'dinner'];
    const components = ['base', 'curry', 'subzi', 'extras'];
    for (const slot of slots) {
      for (const comp of components) {
        expect(locks[`tuesday-${slot}-${comp}`]).toBe(true);
      }
    }
  });

  it('unlockDay sets all 12 lock keys for that day to false', () => {
    const plan = makePlan();
    // Pre-lock tuesday
    const initialLocks: Record<string, boolean> = {};
    const slots = ['breakfast', 'lunch', 'dinner'];
    const components = ['base', 'curry', 'subzi', 'extras'];
    for (const slot of slots) {
      for (const comp of components) {
        initialLocks[`tuesday-${slot}-${comp}`] = true;
      }
    }
    usePlanStore.setState({ plan, locks: initialLocks });

    usePlanStore.getState().unlockDay('tuesday');

    const locks = usePlanStore.getState().locks;
    for (const slot of slots) {
      for (const comp of components) {
        expect(locks[`tuesday-${slot}-${comp}`]).toBe(false);
      }
    }
  });

  it('initFromDB loads plan and locks from Dexie active_plan table', async () => {
    const plan = makePlan();
    const locks = { 'monday-breakfast-base': true };
    await saveActivePlan({ plan, locks });

    await usePlanStore.getState().initFromDB();

    const state = usePlanStore.getState();
    expect(state.plan).toEqual(plan);
    expect(state.locks).toEqual(locks);
    expect(state.hydrated).toBe(true);
  });

  it('initFromDB sets hydrated to true even when no plan exists in DB', async () => {
    // DB is empty (cleared in beforeEach)
    await usePlanStore.getState().initFromDB();

    const state = usePlanStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.plan).toBeNull();
    expect(state.locks).toEqual({});
  });
});
