// The two primitives. COUNT bounds how many matching assignments a group may hold;
// PREFER adds a soft cost (or reward) per matching assignment. Plain, serialisable data.
import { z } from 'zod';
import { MatcherSchema, type Matcher } from './matcher';
import { DAYS, MEALS, type Day, type Meal } from './types';

/** Time dimension of a group. `{ days: k }` is a sliding window of k consecutive days. */
export type TimeGroup = 'slot' | 'day' | 'meal' | 'plan' | { days: number };
/** `'component'` is shorthand for `['component', 'plan']`: one group per component. */
export type GroupBy = TimeGroup | 'component' | ['component', TimeGroup];

/**
 * Hard bounds must hold; soft bounds are preferred and cost `costs.min` / `costs.max` per unit
 * outside them. Any subset may be given; they must be ordered hardMin <= softMin <= softMax <= hardMax.
 */
export interface Bounds { hardMin?: number; softMin?: number; softMax?: number; hardMax?: number }

export type Origin = 'builtin' | 'rule';

interface Common {
  id: string;
  label: string;
  origin: Origin;
  /** Id of the stored rule this constraint was compiled from, for explanations. */
  ruleId?: number;
}

export interface CountConstraint extends Common {
  kind: 'count';
  /** Assignments that are counted. */
  select: Matcher;
  groupBy: GroupBy;
  /**
   * Only evaluate a group when its time group (same slot, day, meal, window or plan; any component)
   * contains an assignment matching this trigger.
   */
  when?: { exists: Matcher };
  /** Only evaluate groups for these days / meals. Valid for slot, day and meal groups only. */
  scope?: { days?: Day[]; meals?: Meal[] };
  bounds: Bounds;
  /** Hard penalty per unit outside a hard bound, for choosing which rule to break when rules conflict. Default 1. */
  severity?: number;
  costs?: { min?: number; max?: number };
}

export interface PreferConstraint extends Common {
  kind: 'prefer';
  select: Matcher;
  /** Soft cost per matching assignment; negative is a reward. */
  weight: number;
}

export type Constraint = CountConstraint | PreferConstraint;

export const timeOf = (g: GroupBy): TimeGroup => (g === 'component' ? 'plan' : Array.isArray(g) ? g[1] : g);
export const byComponent = (g: GroupBy): boolean => g === 'component' || Array.isArray(g);

const TimeGroupSchema = z.union([
  z.enum(['slot', 'day', 'meal', 'plan']),
  z.object({ days: z.number().int().min(1).max(DAYS.length) }).strict(),
]);

const count = z.number().int().min(0);

const CommonShape = {
  id: z.string().min(1),
  label: z.string().min(1),
  origin: z.enum(['builtin', 'rule']),
  ruleId: z.number().int().optional(),
};

const CountSchema = z
  .object({
    kind: z.literal('count'),
    ...CommonShape,
    select: MatcherSchema,
    groupBy: z.union([TimeGroupSchema, z.literal('component'), z.tuple([z.literal('component'), TimeGroupSchema])]),
    when: z.object({ exists: MatcherSchema }).strict().optional(),
    scope: z
      .object({ days: z.array(z.enum(DAYS)).min(1).optional(), meals: z.array(z.enum(MEALS)).min(1).optional() })
      .strict()
      .optional(),
    bounds: z
      .object({ hardMin: count.optional(), softMin: count.optional(), softMax: count.optional(), hardMax: count.optional() })
      .strict(),
    severity: z.number().positive().optional(),
    costs: z.object({ min: z.number().min(0).optional(), max: z.number().min(0).optional() }).strict().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const { hardMin, softMin, softMax, hardMax } = c.bounds;
    const order = [hardMin, softMin, softMax, hardMax].filter((v): v is number => v !== undefined);
    if (order.length === 0) ctx.addIssue({ code: 'custom', path: ['bounds'], message: 'at least one bound is required' });
    if (order.some((v, i) => i > 0 && v < order[i - 1])) {
      ctx.addIssue({ code: 'custom', path: ['bounds'], message: 'bounds must satisfy hardMin <= softMin <= softMax <= hardMax' });
    }
    // Per-component groups only exist for components that are placed, so a minimum could never fire.
    if (byComponent(c.groupBy) && (hardMin !== undefined || softMin !== undefined)) {
      ctx.addIssue({ code: 'custom', path: ['bounds'], message: 'per-component groups support maximum bounds only' });
    }
    const time = timeOf(c.groupBy);
    if (c.scope && !(time === 'slot' || time === 'day' || time === 'meal')) {
      ctx.addIssue({ code: 'custom', path: ['scope'], message: 'scope applies to slot, day or meal groups only; restrict `select` instead' });
    }
    if (c.scope?.meals && time === 'day') {
      ctx.addIssue({ code: 'custom', path: ['scope', 'meals'], message: 'day groups cannot be scoped by meal' });
    }
    if (c.scope?.days && time === 'meal') {
      ctx.addIssue({ code: 'custom', path: ['scope', 'days'], message: 'meal groups cannot be scoped by day' });
    }
  });

const PreferSchema = z
  .object({ kind: z.literal('prefer'), ...CommonShape, select: MatcherSchema, weight: z.number().finite() })
  .strict();

export const ConstraintSchema = z.discriminatedUnion('kind', [CountSchema, PreferSchema]) as unknown as z.ZodType<Constraint>;
