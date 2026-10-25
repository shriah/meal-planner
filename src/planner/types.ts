// Shared vocabulary of the planner. Headless: imports only pure domain types.
import {
  COMPONENT_TYPES,
  type ComponentType,
  type CurryCategory,
  type DietaryTag,
  type Frequency,
  type OccasionTag,
  type ProteinTag,
  type RegionalTag,
} from '@/types/component';

export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Day = (typeof DAYS)[number];

export const MEALS = ['breakfast', 'lunch', 'dinner'] as const;
export type Meal = (typeof MEALS)[number];

/** Role a component plays inside a slot. Each component type fills the role of the same name. */
export const ROLES = COMPONENT_TYPES;
export type Role = ComponentType;

/** Structural shape the planner needs; the app's ComponentRecord is assignable to it. */
export interface ComponentLike {
  id: number;
  name: string;
  componentType: ComponentType;
  base_category_id?: number | null;
  extra_category_id?: number | null;
  curry_category?: CurryCategory;
  dietary_tags: readonly DietaryTag[];
  protein_tag?: ProteinTag;
  regional_tags: readonly RegionalTag[];
  occasion_tags: readonly OccasionTag[];
  frequency?: Frequency;
}

/** One component placed in one role of one slot. */
export interface Assignment {
  c: ComponentLike;
  role: Role;
  day: Day;
  meal: Meal;
}

/** Solver-side slot: component ids per role. */
export interface SlotState {
  base?: number;
  curry?: number;
  subzi?: number;
  extras: number[];
}

/** 21 slots, index = dayIndex * 3 + mealIndex. */
export type PlanState = SlotState[];

export const SLOT_COUNT = DAYS.length * MEALS.length;
export const slotIndex = (day: Day, meal: Meal): number => DAYS.indexOf(day) * MEALS.length + MEALS.indexOf(meal);
export const slotDay = (i: number): Day => DAYS[Math.floor(i / MEALS.length)];
export const slotMeal = (i: number): Meal => MEALS[i % MEALS.length];
export const emptyPlan = (): PlanState => Array.from({ length: SLOT_COUNT }, () => ({ extras: [] }));

/** Locked values for one slot. The solver never moves a pinned value. */
export interface SlotPins {
  base_id?: number;
  curry_id?: number;
  subzi_id?: number;
  extra_ids?: number[];
}
export type Pins = Partial<Record<`${Day}-${Meal}`, SlotPins>>;

export const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
