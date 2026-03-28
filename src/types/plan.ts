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

// ─── Target ───────────────────────────────────────────────────────────────────

export const TargetSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('component_type'), component_type: z.enum(['base', 'curry', 'subzi']) }),
  z.object({ mode: z.literal('tag'), filter: TagFilterSchema }),
  z.object({ mode: z.literal('component'), component_id: z.number() }),
  z.object({ mode: z.literal('base_category'), category_id: z.number() }),
]);

export type Target = z.infer<typeof TargetSchema>;

// ─── RuleScope ────────────────────────────────────────────────────────────────

export const RuleScopeSchema = z.object({
  days:  z.array(DayOfWeekEnum).nullable(),
  slots: z.array(MealSlotEnum).nullable(),
});

export type RuleScope = z.infer<typeof RuleScopeSchema>;

// ─── Effects ──────────────────────────────────────────────────────────────────

export const EffectSchema = z.discriminatedUnion('kind', [
  // Selection effects (mutually exclusive — at most one per rule)
  z.object({ kind: z.literal('filter_pool') }),
  z.object({ kind: z.literal('require_one') }),
  z.object({ kind: z.literal('exclude') }),
  z.object({ kind: z.literal('no_repeat') }),
  // Placement effect
  z.object({ kind: z.literal('allowed_slots'), slots: z.array(MealSlotEnum) }),
  // Component shape
  z.object({ kind: z.literal('skip_component'), component_types: z.array(z.enum(['curry', 'subzi'])) }),
  // Extra effects
  z.object({ kind: z.literal('require_extra'), category_ids: z.array(z.number()) }),
]);

export type AnyEffect = z.infer<typeof EffectSchema>;

// Concrete types for each effect variant
export type FilterPoolEffect   = Extract<AnyEffect, { kind: 'filter_pool' }>;
export type RequireOneEffect   = Extract<AnyEffect, { kind: 'require_one' }>;
export type ExcludeEffect      = Extract<AnyEffect, { kind: 'exclude' }>;
export type NoRepeatEffect     = Extract<AnyEffect, { kind: 'no_repeat' }>;
export type AllowedSlotsEffect = Extract<AnyEffect, { kind: 'allowed_slots' }>;
export type SkipComponentEffect = Extract<AnyEffect, { kind: 'skip_component' }>;
export type RequireExtraEffect = Extract<AnyEffect, { kind: 'require_extra' }>;

export type SelectionEffect = FilterPoolEffect | RequireOneEffect | ExcludeEffect | NoRepeatEffect;
export type CompositionEffect = AllowedSlotsEffect | SkipComponentEffect | RequireExtraEffect;

// ─── CompiledRule (unified) ───────────────────────────────────────────────────

export const CompiledRuleSchema = z.object({
  type:    z.literal('rule'),
  target:  TargetSchema,
  scope:   RuleScopeSchema,
  effects: z.array(EffectSchema),
});

export type CompiledRule = z.infer<typeof CompiledRuleSchema>;

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
