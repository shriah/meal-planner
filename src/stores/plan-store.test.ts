import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db/client';
import { usePlanStore } from './plan-store';
import { saveActivePlan } from '@/services/plan-db';
import { getISOWeekStart, addWeeks } from '@/services/week-utils';
import type { WeeklyPlan } from '@/types/plan';
import * as generatorService from '@/services/generator';

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
  await db.saved_plans.clear();
  // Reset store to initial state
  usePlanStore.setState({
    plan: null,
    locks: {},
    warnings: [],
    isGenerating: false,
    hydrated: false,
    warningBannerDismissed: false,
    currentWeekStart: getISOWeekStart(new Date()),
    isReadOnly: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Store tests ──────────────────────────────────────────────────────────────

describe('plan-store', () => {
  it('setLock sets a lock key to true and persists to Dexie', async () => {
    const plan = makePlan();
    usePlanStore.setState({ plan });

    usePlanStore.getState().setLock('monday-breakfast-base', true);

    expect(usePlanStore.getState().locks['monday-breakfast-base']).toBe(true);

    // Wait for async save to complete (setLock fires saveWeekPlan but doesn't await)
    await new Promise(resolve => setTimeout(resolve, 50));

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

  it('swapComponent persists an explicitly selected incompatible curry unchanged', async () => {
    const plan = makePlan();
    usePlanStore.setState({ plan });

    usePlanStore.getState().swapComponent('monday', 'lunch', 'curry', 999);

    expect(usePlanStore.getState().plan?.slots.find(
      slot => slot.day === 'monday' && slot.meal_slot === 'lunch',
    )?.curry_id).toBe(999);

    await new Promise(resolve => setTimeout(resolve, 50));

    const record = await db.active_plan.get('current');
    expect(record?.plan.slots.find(
      slot => slot.day === 'monday' && slot.meal_slot === 'lunch',
    )?.curry_id).toBe(999);
  });

  it('regenerate forwards locked incompatible curry selections back into generate unchanged', async () => {
    const plan = makePlan();
    plan.slots = plan.slots.map((slot) => (
      slot.day === 'monday' && slot.meal_slot === 'lunch'
        ? { ...slot, curry_id: 999 }
        : slot
    ));

    const generateSpy = vi.spyOn(generatorService, 'generate').mockResolvedValue({
      plan,
      warnings: [],
    });

    usePlanStore.setState({
      plan,
      locks: {
        'monday-lunch-base': true,
        'monday-lunch-curry': true,
      },
    });

    await usePlanStore.getState().regenerate();

    expect(generateSpy).toHaveBeenCalledWith({
      lockedSlots: {
        'monday-lunch': {
          base_id: 1,
          curry_id: 999,
        },
      },
    });
  });
});

// ─── Week navigation tests ────────────────────────────────────────────────────

describe('week navigation', () => {
  it('navigateToWeek sets currentWeekStart and isReadOnly for past week', async () => {
    const thisWeek = getISOWeekStart(new Date());
    const pastWeek = addWeeks(thisWeek, -2);

    await usePlanStore.getState().navigateToWeek(pastWeek);

    const state = usePlanStore.getState();
    expect(state.currentWeekStart).toBe(pastWeek);
    expect(state.isReadOnly).toBe(true);
  });

  it('navigateToWeek to current week sets isReadOnly false and loads from active_plan', async () => {
    const thisWeek = getISOWeekStart(new Date());
    const pastWeek = addWeeks(thisWeek, -1);
    const plan = makePlan();
    const locks = { 'monday-breakfast-base': true };
    await saveActivePlan({ plan, locks });

    // Navigate away first
    await usePlanStore.getState().navigateToWeek(pastWeek);
    expect(usePlanStore.getState().isReadOnly).toBe(true);

    // Navigate back to current week
    await usePlanStore.getState().navigateToWeek(thisWeek);

    const state = usePlanStore.getState();
    expect(state.currentWeekStart).toBe(thisWeek);
    expect(state.isReadOnly).toBe(false);
    expect(state.plan).toEqual(plan);
    expect(state.locks).toEqual(locks);
  });

  it('navigateToWeek to future week with no saved plan sets plan to null', async () => {
    const thisWeek = getISOWeekStart(new Date());
    const futureWeek = addWeeks(thisWeek, 2);

    await usePlanStore.getState().navigateToWeek(futureWeek);

    const state = usePlanStore.getState();
    expect(state.currentWeekStart).toBe(futureWeek);
    expect(state.plan).toBeNull();
    expect(state.isReadOnly).toBe(false);
  });
});
