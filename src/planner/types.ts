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

/** The types a stored rule's `role` field names (stored-rule schemas only, until Stage 3; the planner rejects it). */
export const ROLES = COMPONENT_TYPES;
export type Role = ComponentType;

/** A user-visible part of a meal. A meal's parts are a `readonly PlannerPart[]` in order; index 0 is the first part. */
export interface PlannerPart {
  id: number;
  name: string;
  varied: boolean;
}

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
  /** The part the dish fills. */
  part_id: number;
  category_id?: number | null;
  /** Tag value ids by tag group id. */
  tags?: Readonly<Record<number, readonly number[]>>;
}

/** One dish placed in one part of one slot. */
export interface Assignment {
  c: ComponentLike;
  /** Id of the part the dish is placed in (the slot's part; the dish's own is `c.part_id`). */
  part: number;
  day: Day;
  meal: Meal;
}

/** Solver-side slot: the dish ids of each part, by part position. Arrays are never changed in place. */
export interface SlotState {
  parts: number[][];
}

/** 21 slots, index = dayIndex * 3 + mealIndex. */
export type PlanState = SlotState[];

export const SLOT_COUNT = DAYS.length * MEALS.length;
export const slotIndex = (day: Day, meal: Meal): number => DAYS.indexOf(day) * MEALS.length + MEALS.indexOf(meal);
export const slotDay = (i: number): Day => DAYS[Math.floor(i / MEALS.length)];
export const slotMeal = (i: number): Meal => MEALS[i % MEALS.length];
/** A week of empty meals of `partCount` parts. */
export const emptyPlan = (partCount: number): PlanState =>
  Array.from({ length: SLOT_COUNT }, () => ({ parts: Array.from({ length: partCount }, (): number[] => []) }));

/** A meal by its parts: dish ids per part id. Every part of the model is present, `[]` when empty; the first part holds exactly one dish. */
export interface PartSlot { day: Day; meal_slot: Meal; parts: Record<number, number[]> }
/** Locked parts of one meal: a part id present is locked to exactly that list (`[]` = locked empty); absent = free. */
export type PartPins = Readonly<Record<number, readonly number[]>>;
export type WeekPartPins = Partial<Record<`${Day}-${Meal}`, PartPins>>;
/** The planner's pins: locked parts per meal. The solver never moves a pinned part. */
export type Pins = WeekPartPins;

/** The dishes meal `s` holds in the part at position `k`, in order. The meal's own array: do not change it. */
export const dishesIn = (s: Readonly<SlotState>, k: number): readonly number[] => s.parts[k];
/** Puts `id` in the part at position `k` of `s`, as a new array: replacing the dish of a `single` part, else appended. */
export const withDish = (s: SlotState, k: number, id: number, single: boolean): void => {
  s.parts[k] = single ? [id] : [...s.parts[k], id];
};
/** Takes `id` out of the part at position `k` of `s`, as a new array. */
export const withoutDish = (s: SlotState, k: number, id: number): void => {
  s.parts[k] = s.parts[k].filter((e) => e !== id);
};

export const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
