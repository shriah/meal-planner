import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/client';
import { saveActivePlan, getActivePlan } from '@/services/plan-db';
import { saveWeekPlan, getWeekPlan } from '@/services/plan-db';
import { getISOWeekStart } from '@/services/week-utils';
import type { WeeklyPlan } from '@/types/plan';

// ─── Helper: make a minimal valid WeeklyPlan ──────────────────────────────────

function makePlan(baseId = 1): WeeklyPlan {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
  const slots = ['breakfast', 'lunch', 'dinner'] as const;
  return {
    slots: days.flatMap(day =>
      slots.map(meal_slot => ({
        day,
        meal_slot,
        base_id: baseId,
        extra_ids: [],
      }))
    ),
  };
}

// ─── beforeEach: clear relevant tables ───────────────────────────────────────

beforeEach(async () => {
  await db.saved_plans.clear();
  await db.active_plan.clear();
});

// ─── Active plan functions (existing) ─────────────────────────────────────────

describe('getActivePlan / saveActivePlan', () => {
  it('returns undefined when no active plan exists', async () => {
    const result = await getActivePlan();
    expect(result).toBeUndefined();
  });

  it('saves and retrieves active plan', async () => {
    const plan = makePlan();
    await saveActivePlan({ plan, locks: { 'monday-breakfast-base': true } });
    const result = await getActivePlan();
    expect(result).toBeDefined();
    expect(result!.plan).toEqual(plan);
    expect(result!.locks['monday-breakfast-base']).toBe(true);
  });
});

// ─── Week-keyed CRUD (new) ────────────────────────────────────────────────────

describe('saveWeekPlan / getWeekPlan', () => {
  it('saveWeekPlan stores and getWeekPlan retrieves by week_start key', async () => {
    const plan = makePlan();
    const locks = { 'monday-lunch-base': true };
    await saveWeekPlan('2026-03-16', plan, locks);

    const record = await getWeekPlan('2026-03-16');
    expect(record).toBeDefined();
    expect(record!.week_start).toBe('2026-03-16');
    expect(record!.slots).toEqual(plan);
    expect(record!.locks).toEqual(locks);
  });

  it('getWeekPlan returns undefined for non-existent week', async () => {
    const result = await getWeekPlan('2026-01-01');
    expect(result).toBeUndefined();
  });

  it('saveWeekPlan upserts — second save overwrites first', async () => {
    const plan1 = makePlan(1);
    const plan2 = makePlan(2);
    await saveWeekPlan('2026-03-16', plan1, {});
    await saveWeekPlan('2026-03-16', plan2, { 'tuesday-dinner-base': true });

    const record = await getWeekPlan('2026-03-16');
    expect(record).toBeDefined();
    // Should have the second plan's data
    expect(record!.slots.slots[0].base_id).toBe(2);
    expect(record!.locks['tuesday-dinner-base']).toBe(true);

    // Only one record should exist in the table
    const count = await db.saved_plans.count();
    expect(count).toBe(1);
  });

  it('saveWeekPlan for current week writes through to active_plan', async () => {
    const currentWeekStart = getISOWeekStart(new Date());
    const plan = makePlan(42);
    const locks = { 'friday-breakfast-base': true };

    await saveWeekPlan(currentWeekStart, plan, locks);

    const active = await db.active_plan.get('current');
    expect(active).toBeDefined();
    expect(active!.plan).toEqual(plan);
    expect(active!.locks).toEqual(locks);
  });

  it('saveWeekPlan for a past week does NOT write through to active_plan', async () => {
    const pastWeekStart = '2025-01-06'; // definitely not this week
    const plan = makePlan(99);
    await saveWeekPlan(pastWeekStart, plan, {});

    const active = await db.active_plan.get('current');
    expect(active).toBeUndefined();
  });
});
