import type { MealSlot } from './preferences';

// Rule definitions live in src/rules; this module holds the plan shapes the app stores.

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export const ALL_DAYS: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export interface PlanSlot {
  day: DayOfWeek;
  meal_slot: MealSlot;
  base_id: number;
  curry_id?: number;
  subzi_id?: number;
  extra_ids: number[];
}

export interface WeeklyPlan {
  slots: PlanSlot[];
}
