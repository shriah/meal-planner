import { z } from 'zod';
import type { MealSlot } from './preferences';
import type { DietaryTag, ProteinTag, RegionalTag, OccasionTag } from './component';

// Suppress unused type import warnings — these are used via Zod inference only
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _DietaryTag = DietaryTag;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ProteinTag = ProteinTag;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _RegionalTag = RegionalTag;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _OccasionTag = OccasionTag;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _MealSlot = MealSlot;

// ─── DayOfWeek ───────────────────────────────────────────────────────────────

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

// ─── Internal Zod enums (not exported — use type aliases below) ───────────────

const DayOfWeekEnum = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

const MealSlotEnum = z.enum(['breakfast', 'lunch', 'dinner']);

// ─── TagFilter ────────────────────────────────────────────────────────────────

export const TagFilterSchema = z.object({
  dietary_tag: z
    .enum(['veg', 'non-veg', 'vegan', 'jain', 'eggetarian'])
    .optional(),
  protein_tag: z
    .enum(['fish', 'chicken', 'mutton', 'egg', 'paneer', 'dal', 'none'])
    .optional(),
  regional_tag: z
    .enum(['south-indian', 'north-indian', 'coastal-konkan', 'pan-indian'])
    .optional(),
  occasion_tag: z
    .enum([
      'everyday', 'weekday', 'weekend', 'fasting', 'festive',
      'monday', 'tuesday', 'wednesday', 'thursday',
      'friday', 'saturday', 'sunday',
    ])
    .optional(),
});

export type TagFilter = z.infer<typeof TagFilterSchema>;

// ─── CompiledFilter (discriminated union) ────────────────────────────────────

export const CompiledFilterSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('day-filter'),
    days: z.array(DayOfWeekEnum),
    slots: z.array(MealSlotEnum).nullable(),
    filter: TagFilterSchema,
  }),
  z.object({
    type: z.literal('no-repeat'),
    component_type: z.enum(['base', 'curry', 'subzi']),
    within: z.literal('week'),
  }),
  z.object({
    type: z.literal('require-component'),
    component_id: z.number(),
    days: z.array(DayOfWeekEnum),
    slots: z.array(MealSlotEnum).nullable(),
  }),
  z.object({
    type: z.literal('scheduling-rule'),
    effect: z.enum(['filter-pool', 'require-one', 'exclude']),
    days: z.array(DayOfWeekEnum).nullable(),
    slots: z.array(MealSlotEnum).nullable(),
    match: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('tag'), filter: TagFilterSchema }),
      z.object({ mode: z.literal('component'), component_id: z.number() }),
    ]),
  }),
]);

export type CompiledFilter = z.infer<typeof CompiledFilterSchema>;

// Concrete type aliases for each variant (used by rule-compiler and generator)
export type DayFilterRule = Extract<CompiledFilter, { type: 'day-filter' }>;
export type NoRepeatRule = Extract<CompiledFilter, { type: 'no-repeat' }>;
export type RequireComponentRule = Extract<
  CompiledFilter,
  { type: 'require-component' }
>;
export type SchedulingRule = Extract<CompiledFilter, { type: 'scheduling-rule' }>;

// ─── RuleDefinition (structured input from Phase 5 form UI) ──────────────────

export type RuleDefinition =
  | {
      ruleType: 'day-filter';
      days: DayOfWeek[];
      slots?: MealSlot[];
      filter: TagFilter;
    }
  | {
      ruleType: 'no-repeat';
      component_type: 'base' | 'curry' | 'subzi';
    }
  | {
      ruleType: 'require-component';
      component_id: number;
      days: DayOfWeek[];
      slots?: MealSlot[];
    }
  | {
      ruleType: 'scheduling-rule';
      effect: 'filter-pool' | 'require-one' | 'exclude';
      days?: DayOfWeek[];
      slots?: MealSlot[];
      match:
        | { mode: 'tag'; filter: TagFilter }
        | { mode: 'component'; component_id: number };
    };

// ─── Generator result types ───────────────────────────────────────────────────

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

export interface Warning {
  slot: { day: DayOfWeek; meal_slot: MealSlot };
  rule_id: number | null;
  message: string;
}

export interface GeneratorResult {
  plan: WeeklyPlan;
  warnings: Warning[];
}
