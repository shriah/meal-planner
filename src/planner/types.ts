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
  /** The part the dish fills (required from the planner switch-over). */
  part_id?: number;
  category_id?: number | null;
  /** Tag value ids by tag group id. */
  tags?: Readonly<Record<number, readonly number[]>>;
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

/** Locked values for one slot. The solver never moves a pinned value. A `null` curry or subzi holds that role empty. */
export interface SlotPins {
  base_id?: number;
  curry_id?: number | null;
  subzi_id?: number | null;
  extra_ids?: number[];
}
export type Pins = Partial<Record<`${Day}-${Meal}`, SlotPins>>;

/** A meal by its parts: dish ids per part id. Every part of the model is present, `[]` when empty; the first part holds exactly one dish. */
export interface PartSlot { day: Day; meal_slot: Meal; parts: Record<number, number[]> }
/** Locked parts of one meal: a part id present is locked to exactly that list (`[]` = locked empty); absent = free. */
export type PartPins = Readonly<Record<number, readonly number[]>>;
export type WeekPartPins = Partial<Record<`${Day}-${Meal}`, PartPins>>;

/** One part of a meal: the role its dishes fill, whether it holds many dishes, and its pin. */
export interface PartDef { role: Role; many: boolean; pin: keyof SlotPins }
/** The parts of a meal, in order. The first is the meal's base, which is never left empty. */
export const PARTS: readonly PartDef[] = [
  { role: 'base', many: false, pin: 'base_id' },
  { role: 'curry', many: false, pin: 'curry_id' },
  { role: 'subzi', many: false, pin: 'subzi_id' },
  { role: 'extra', many: true, pin: 'extra_ids' },
];
/** The part a dish of type `role` fills. */
export const partOf = (role: Role | undefined): PartDef | undefined => PARTS.find((p) => p.role === role);

type SingleRole = Exclude<keyof SlotState, 'extras'>;
// Until meal parts are user-defined, a many part is the extras list and a single part is the field of its role.
const single = (p: PartDef) => p.role as SingleRole;

/** The dishes meal `s` holds in part `p`, in order. A many part returns the meal's own array: do not change it. */
export const dishesIn = (s: Readonly<SlotState>, p: PartDef): readonly number[] => {
  if (p.many) return s.extras;
  const id = s[single(p)];
  return id === undefined ? [] : [id];
};
/** Puts `id` in part `p` of `s`: appended to a many part (as a new array), replacing a single part's dish. */
export const withDish = (s: SlotState, p: PartDef, id: number): void => {
  if (p.many) s.extras = [...s.extras, id];
  else s[single(p)] = id;
};
/** Takes `id` out of part `p` of `s`: a many part gets a new array without it; a single part holding it is emptied. */
export const withoutDish = (s: SlotState, p: PartDef, id: number): void => {
  if (p.many) s.extras = s.extras.filter((e) => e !== id);
  else if (s[single(p)] === id) s[single(p)] = undefined;
};

export const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
