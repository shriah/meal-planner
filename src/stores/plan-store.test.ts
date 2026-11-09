import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, type RuleRecord } from '@/db/client';
import { linkRule } from '@/rules';
import { usePlanStore } from './plan-store';
import { saveActivePlan, saveWeekPlan } from '@/services/plan-db';
import { getISOWeekStart, addWeeks } from '@/services/week-utils';
import type { WeeklyPlan } from '@/types/plan';
import * as planningService from '@/services/planning';

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
    problems: [],
    ruleIssues: [],
    paired: [],
    isGenerating: false,
    hydrated: false,
    problemsDismissed: false,
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

  it('re-plans only the meal whose base was picked by hand', async () => {
    await db.components.clear();
    await db.rules.clear();
    const now = '';
    const add = async (name: string, componentType: 'base' | 'curry' | 'extra') =>
      await db.components.add({ name, componentType, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: now }) as number;
    const rice = await add('Rice', 'base');
    const idli = await add('Idli', 'base');
    const dal = await add('Dal', 'curry');
    const sambar = await add('Sambar', 'curry');
    const rasam = await add('Rasam', 'curry');
    const chutney = await add('Chutney', 'extra');
    const podi = await add('Podi', 'extra');
    const store = async (rule: ReturnType<typeof linkRule>) => { await db.rules.add({ ...rule, enabled: true, created_at: now } as RuleRecord); };
    await store(linkRule({ id: sambar, name: 'Sambar' }, { mode: 'serve', target: 'base_dish', values: [idli] }));
    await store(linkRule({ id: podi, name: 'Podi' }, { mode: 'serve', target: 'base_dish', values: [idli] }));
    await store(linkRule({ id: chutney, name: 'Chutney' }, { mode: 'serve', target: 'base_dish', values: [idli], strength: 'usually' }));
    await store(linkRule({ id: chutney, name: 'Chutney' }, { mode: 'never', target: 'extra_dish', values: [podi] }));

    const plan = makePlan();
    plan.slots = plan.slots.map((s, i) => ({ ...s, base_id: rice, ...(i % 2 ? { curry_id: dal } : {}), extra_ids: i % 3 ? [] : [chutney] }));
    plan.slots[0] = { ...plan.slots[0], curry_id: dal, extra_ids: [] };
    plan.slots[3] = { ...plan.slots[3], curry_id: rasam, extra_ids: [] };
    const before = plan.slots;
    usePlanStore.setState({ plan, locks: { 'tuesday-breakfast-curry': true } });

    usePlanStore.getState().swapComponent('monday', 'breakfast', 'base', idli);
    usePlanStore.getState().swapComponent('tuesday', 'breakfast', 'base', idli);

    const slots = () => usePlanStore.getState().plan!.slots;
    await vi.waitFor(() => {
      expect(slots()[0]).toEqual({ day: 'monday', meal_slot: 'breakfast', base_id: idli, curry_id: sambar, extra_ids: [podi] });
      expect(slots()[3]).toEqual({ day: 'tuesday', meal_slot: 'breakfast', base_id: idli, curry_id: rasam, extra_ids: [podi] });
    }, { timeout: 5000 });
    slots().forEach((s, i) => { if (i !== 0 && i !== 3) expect(s).toBe(before[i]); });
  }, 10_000);

  it('keeps a curry picked by hand while its meal is being re-planned', async () => {
    let finish!: () => void;
    const planned = makePlan();
    planned.slots[0] = { ...planned.slots[0], base_id: 2, curry_id: 30 };
    vi.spyOn(planningService, 'generatePlan').mockImplementation(() =>
      new Promise((resolve) => { finish = () => resolve({ plan: planned, problems: [], ruleIssues: [], paired: [] } as never); }));
    usePlanStore.setState({ plan: makePlan() });

    usePlanStore.getState().swapComponent('monday', 'breakfast', 'base', 2);
    usePlanStore.getState().swapComponent('monday', 'breakfast', 'curry', 40);
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(usePlanStore.getState().plan!.slots[0]).toMatchObject({ base_id: 2, curry_id: 40 });
  });

  it('applies the re-plan of a meal left as it was picked', async () => {
    const planned = makePlan();
    planned.slots[0] = { ...planned.slots[0], base_id: 2, curry_id: 30 };
    vi.spyOn(planningService, 'generatePlan').mockResolvedValue({ plan: planned, problems: [], ruleIssues: [], paired: [] } as never);
    usePlanStore.setState({ plan: makePlan() });

    usePlanStore.getState().swapComponent('monday', 'breakfast', 'base', 2);

    await vi.waitFor(() => expect(usePlanStore.getState().plan!.slots[0]).toMatchObject({ base_id: 2, curry_id: 30 }));
  });

  it('keeps the pairings of a generated plan', async () => {
    const paired = [{ day: 'monday', meal: 'breakfast', component: 30, by: 2 }];
    vi.spyOn(planningService, 'generatePlan').mockResolvedValue({ plan: makePlan(), problems: [], ruleIssues: [], paired } as never);
    usePlanStore.setState({ plan: makePlan() });
    await usePlanStore.getState().regenerate();
    expect(usePlanStore.getState().paired).toEqual(paired);
  });

  it('drops the pairings of a meal swapped by hand and keeps the others', () => {
    usePlanStore.setState({
      plan: makePlan(),
      paired: [
        { day: 'monday', meal: 'breakfast', component: 30, by: 2 },
        { day: 'tuesday', meal: 'breakfast', component: 31, by: 2 },
      ],
    });
    usePlanStore.getState().swapComponent('monday', 'breakfast', 'curry', 40);
    expect(usePlanStore.getState().paired).toEqual([{ day: 'tuesday', meal: 'breakfast', component: 31, by: 2 }]);
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

  it('regenerate pins locked incompatible curry selections unchanged', async () => {
    const plan = makePlan();
    plan.slots = plan.slots.map((slot) => (
      slot.day === 'monday' && slot.meal_slot === 'lunch'
        ? { ...slot, curry_id: 999 }
        : slot
    ));

    const generateSpy = vi.spyOn(planningService, 'generatePlan').mockResolvedValue({
      plan,
      problems: [],
      ruleIssues: [],
      paired: [],
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
      pins: {
        'monday-lunch': {
          base_id: 1,
          curry_id: 999,
        },
      },
    });
  });

  it('regenerate pins a locked curry even when the base itself is not locked', async () => {
    const plan = makePlan();
    plan.slots = plan.slots.map((slot) => (
      slot.day === 'monday' && slot.meal_slot === 'lunch'
        ? { ...slot, curry_id: 999 }
        : slot
    ));

    const generateSpy = vi.spyOn(planningService, 'generatePlan').mockResolvedValue({
      plan,
      problems: [],
      ruleIssues: [],
      paired: [],
    });

    usePlanStore.setState({
      plan,
      locks: {
        'monday-lunch-curry': true,
      },
    });

    await usePlanStore.getState().regenerate();

    expect(generateSpy).toHaveBeenCalledWith({
      pins: {
        'monday-lunch': {
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

  describe('the pairings of a stored plan', () => {
    // Pongal with Sambar (always served with it) on Monday breakfast; every other meal is Rice alone.
    async function storedPairing() {
      await db.components.clear();
      await db.rules.clear();
      const add = async (name: string, componentType: 'base' | 'curry') =>
        await db.components.add({ name, componentType, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' }) as number;
      const rice = await add('Rice', 'base');
      const pongal = await add('Pongal', 'base');
      const sambar = await add('Sambar', 'curry');
      await db.rules.add({ ...linkRule({ id: sambar, name: 'Sambar' }, { mode: 'serve', target: 'base_dish', values: [pongal] }), enabled: true, created_at: '' } as RuleRecord);
      const plan = makePlan();
      plan.slots = plan.slots.map((s) => ({ ...s, base_id: rice }));
      plan.slots[0] = { ...plan.slots[0], base_id: pongal, curry_id: sambar };
      return { plan, expected: [{ day: 'monday', meal: 'breakfast', component: sambar, by: pongal, ruleId: expect.any(Number) }] };
    }

    it('are worked out when the app loads the current plan', async () => {
      const { plan, expected } = await storedPairing();
      await saveActivePlan({ plan, locks: {} });
      await usePlanStore.getState().initFromDB();
      expect(usePlanStore.getState().paired).toEqual(expected);
    });

    it('are worked out when navigating to the current week', async () => {
      const { plan, expected } = await storedPairing();
      await saveActivePlan({ plan, locks: {} });
      await usePlanStore.getState().navigateToWeek(getISOWeekStart(new Date()));
      expect(usePlanStore.getState().paired).toEqual(expected);
    });

    it('are worked out when navigating to another saved week', async () => {
      const { plan, expected } = await storedPairing();
      const nextWeek = addWeeks(getISOWeekStart(new Date()), 1);
      await saveWeekPlan(nextWeek, plan, {});
      await usePlanStore.getState().navigateToWeek(nextWeek);
      expect(usePlanStore.getState().paired).toEqual(expected);
    });

    it('are not applied once another plan has been loaded meanwhile', async () => {
      const { plan } = await storedPairing();
      await saveActivePlan({ plan, locks: {} });
      const input = await planningService.loadPlanningInput();
      let release!: () => void;
      vi.spyOn(planningService, 'loadPlanningInput').mockImplementation(() => new Promise((resolve) => { release = () => resolve(input); }));
      const loading = usePlanStore.getState().navigateToWeek(getISOWeekStart(new Date()));
      await vi.waitFor(() => expect(release).toBeDefined());
      usePlanStore.setState({ plan: makePlan(), paired: [] });
      release();
      await loading;
      expect(usePlanStore.getState().paired).toEqual([]);
    });
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
