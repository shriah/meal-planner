import { db } from '@/db/client';
import type { ActivePlanRecord } from '@/db/client';
import type { WeeklyPlan } from '@/types/plan';

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
