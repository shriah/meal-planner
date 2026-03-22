import { db } from '@/db/client';
import type { ActivePlanRecord, SavedPlanRecord } from '@/db/client';
import type { WeeklyPlan } from '@/types/plan';
import { getISOWeekStart } from '@/services/week-utils';

export async function getActivePlan(): Promise<ActivePlanRecord | undefined> {
  return db.active_plan.get('current');
}

export async function saveActivePlan(data: { plan: WeeklyPlan; locks: Record<string, boolean> }): Promise<void> {
  await db.active_plan.put({
    id: 'current',
    plan: data.plan,
    locks: data.locks,
    updated_at: new Date().toISOString(),
  });
}

export async function clearActivePlan(): Promise<void> {
  await db.active_plan.delete('current');
}

/**
 * Saves a week plan keyed by ISO week start date (YYYY-MM-DD, Monday).
 * Upserts: if a record already exists for this week, it is overwritten.
 * Write-through: if weekStart matches the current week, also saves to active_plan (D-03, D-09).
 */
export async function saveWeekPlan(
  weekStart: string,
  plan: WeeklyPlan,
  locks: Record<string, boolean>
): Promise<void> {
  const existing = await db.saved_plans.where('week_start').equals(weekStart).first();
  if (existing) {
    await db.saved_plans.update(existing.id!, {
      slots: plan,
      locks,
      created_at: new Date().toISOString(),
    });
  } else {
    await db.saved_plans.add({
      week_start: weekStart,
      slots: plan,
      locks,
      created_at: new Date().toISOString(),
    });
  }
  // Write-through to active_plan if this is the current week
  const currentWeekStart = getISOWeekStart(new Date());
  if (weekStart === currentWeekStart) {
    await saveActivePlan({ plan, locks });
  }
}

/**
 * Retrieves a saved week plan by its ISO week start date.
 * Returns undefined if no plan has been saved for that week.
 */
export async function getWeekPlan(weekStart: string): Promise<SavedPlanRecord | undefined> {
  return db.saved_plans.where('week_start').equals(weekStart).first();
}
