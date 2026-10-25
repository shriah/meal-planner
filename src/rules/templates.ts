// Rule templates: the user-facing rule types. Each compiles to planner constraints, describes
// itself, and lists the ids it references. Adding a rule type means adding a template here.
import { z } from 'zod';
import {
  DAYS, MEALS, ROLES, MatcherSchema, all, is, isLeaf, not, oneOf,
  type Bounds, type Constraint, type GroupBy, type Matcher, type Role,
} from '@/planner';
import { describeMatcher, describeScope, type Names } from './describe';

// ─── Shared params ────────────────────────────────────────────────────────────

export const ScopeSchema = z
  .object({ days: z.array(z.enum(DAYS)).min(1).optional(), meals: z.array(z.enum(MEALS)).min(1).optional() })
  .strict();
export type Scope = z.infer<typeof ScopeSchema>;

/** `must` rules are hard; `prefer` rules are soft and may be broken when they conflict with others. */
const StrengthSchema = z.enum(['must', 'prefer']).default('must');
export type Strength = z.infer<typeof StrengthSchema>;

/** Soft cost per unit for `prefer` rules; above the built-in preferences (1–3) so user wishes win. */
export const PREFER_COST = 5;

const count = z.number().int().min(0);
const ids = z.array(z.number().int());
const SKIPPABLE = ['curry', 'subzi', 'extra'] as const;
const DEFAULT_REPEAT_ROLES: Role[] = ['base', 'curry', 'subzi'];

// ─── Params per template ──────────────────────────────────────────────────────

const ExcludeParams = z.object({ match: MatcherSchema, scope: ScopeSchema.optional(), strength: StrengthSchema }).strict();

const OnlyAllowParams = z
  .object({ match: MatcherSchema, roles: z.array(z.enum(ROLES)).min(1), scope: ScopeSchema.optional(), strength: StrengthSchema })
  .strict();

const RequireParams = z
  .object({ match: MatcherSchema, min: z.number().int().min(1).default(1), scope: ScopeSchema.optional(), strength: StrengthSchema })
  .strict();

const LimitParams = z
  .object({
    match: MatcherSchema,
    per: z.enum(['meal', 'day', 'week']),
    min: count.optional(),
    max: count.optional(),
    scope: ScopeSchema.optional(),
    strength: StrengthSchema,
  })
  .strict()
  .refine((p) => p.min !== undefined || p.max !== undefined, { message: 'set a minimum, a maximum, or both', path: ['max'] })
  .refine((p) => p.min === undefined || p.max === undefined || p.min <= p.max, { message: 'minimum must not exceed maximum', path: ['min'] });

const NoRepeatParams = z
  .object({
    match: MatcherSchema,
    /** `week`: at most once in the week; a number k: not again within k consecutive days. */
    within: z.union([z.literal('week'), z.number().int().min(2).max(DAYS.length - 1)]).default('week'),
    roles: z.array(z.enum(ROLES)).min(1).default(DEFAULT_REPEAT_ROLES),
    scope: ScopeSchema.optional(),
    strength: StrengthSchema,
  })
  .strict();

const AllowedMealsParams = z
  .object({ match: MatcherSchema, meals: z.array(z.enum(MEALS)).min(1), days: z.array(z.enum(DAYS)).min(1).optional(), strength: StrengthSchema })
  .strict();

const SkipWhenParams = z
  .object({ when: MatcherSchema, skip: z.array(z.enum(SKIPPABLE)).min(1), scope: ScopeSchema.optional(), strength: StrengthSchema })
  .strict();

const RequireWithParams = z
  .object({
    when: MatcherSchema,
    components: ids.default([]),
    extraCategories: ids.default([]),
    scope: ScopeSchema.optional(),
    strength: StrengthSchema,
  })
  .strict()
  .refine((p) => p.components.length + p.extraCategories.length > 0, { message: 'choose at least one component or extra category', path: ['components'] });

const PreferParams = z
  .object({ match: MatcherSchema, direction: z.enum(['prefer', 'avoid']), weight: z.number().int().min(1).max(5).default(2) })
  .strict();

export const RuleSpecSchema = z.discriminatedUnion('template', [
  z.object({ template: z.literal('exclude'), params: ExcludeParams }).strict(),
  z.object({ template: z.literal('only_allow'), params: OnlyAllowParams }).strict(),
  z.object({ template: z.literal('require'), params: RequireParams }).strict(),
  z.object({ template: z.literal('limit'), params: LimitParams }).strict(),
  z.object({ template: z.literal('no_repeat'), params: NoRepeatParams }).strict(),
  z.object({ template: z.literal('allowed_meals'), params: AllowedMealsParams }).strict(),
  z.object({ template: z.literal('skip_when'), params: SkipWhenParams }).strict(),
  z.object({ template: z.literal('require_with'), params: RequireWithParams }).strict(),
  z.object({ template: z.literal('prefer'), params: PreferParams }).strict(),
]);

/** A validated rule definition. `RuleSpecInput` is what may be stored or built by a form (defaults optional). */
export type RuleSpec = z.infer<typeof RuleSpecSchema>;
export type RuleSpecInput = z.input<typeof RuleSpecSchema>;
export type TemplateId = RuleSpec['template'];
export type ParamsOf<T extends TemplateId> = Extract<RuleSpec, { template: T }>['params'];

// ─── Compilation helpers ──────────────────────────────────────────────────────

/** A constraint without the identity fields, which the rule compiler assigns. */
type Body<C> = C extends unknown ? Omit<C, 'id' | 'label' | 'origin' | 'ruleId'> : never;
export type ConstraintBody = Body<Constraint>;

function bounds(strength: Strength, min?: number, max?: number): { bounds: Bounds; costs?: { min: number; max: number } } {
  if (strength === 'must') return { bounds: { hardMin: min, hardMax: max } };
  return { bounds: { softMin: min, softMax: max }, costs: { min: PREFER_COST, max: PREFER_COST } };
}

/** Day / meal restrictions as matcher conditions, for groups that cannot be scoped (week, per component). */
function scopeConditions(scope: Scope | undefined): Matcher[] {
  const out: Matcher[] = [];
  if (scope?.days) out.push(oneOf('day', scope.days));
  if (scope?.meals) out.push(oneOf('meal', scope.meals));
  return out;
}

const slotCount = (select: Matcher, scope: Scope | undefined, strength: Strength, min?: number, max?: number, when?: Matcher): ConstraintBody => ({
  kind: 'count', select, groupBy: 'slot', ...(scope && { scope }), ...(when && { when: { exists: when } }), ...bounds(strength, min, max),
});

export interface Refs { components: number[]; baseCategories: number[]; extraCategories: number[] }

function matcherRefs(m: Matcher, out: Refs): Refs {
  if (isLeaf(m)) {
    const values = (Array.isArray(m.value) ? m.value : [m.value]) as number[];
    if (m.field === 'id') out.components.push(...values);
    else if (m.field === 'base_category_id' || m.field === 'compatible_base_category_ids') out.baseCategories.push(...values);
    else if (m.field === 'extra_category_id') out.extraCategories.push(...values);
  } else if ('all' in m) m.all.forEach((x) => matcherRefs(x, out));
  else if ('any' in m) m.any.forEach((x) => matcherRefs(x, out));
  else matcherRefs(m.not, out);
  return out;
}
const refsOf = (...ms: Matcher[]): Refs => ms.reduce((acc, m) => matcherRefs(m, acc), { components: [], baseCategories: [], extraCategories: [] } as Refs);

const strengthWord = (s: Strength) => (s === 'must' ? '' : ' (preferred)');
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ROLE_PLURAL: Record<string, string> = { base: 'bases', curry: 'curries', subzi: 'subzis', extra: 'extras' };
const roleList = (roles: readonly string[]) => {
  const words = roles.map((r) => ROLE_PLURAL[r] ?? r);
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
};

// ─── Templates ────────────────────────────────────────────────────────────────

export interface RuleTemplate<P> {
  label: string;
  summary: string;
  compile(params: P): ConstraintBody[];
  describe(params: P, names: Names): string;
  references(params: P): Refs;
}

export const TEMPLATES: { [T in TemplateId]: RuleTemplate<ParamsOf<T>> } = {
  exclude: {
    label: 'Never include',
    summary: 'Matching components are never placed in the chosen days and meals.',
    compile: (p) => [slotCount(p.match, p.scope, p.strength, undefined, 0)],
    describe: (p, n) => `Never include ${describeMatcher(p.match, n)}${describeScope(p.scope)}${strengthWord(p.strength)}`,
    references: (p) => refsOf(p.match),
  },
  only_allow: {
    label: 'Only allow',
    summary: 'In the chosen days and meals, the chosen roles may only hold matching components.',
    compile: (p) => p.roles.map((role) => slotCount(all(is('role', role), not(p.match)), p.scope, p.strength, undefined, 0)),
    describe: (p, n) => `${sentence(roleList(p.roles))}${describeScope(p.scope)}: only ${describeMatcher(p.match, n)}${strengthWord(p.strength)}`,
    references: (p) => refsOf(p.match),
  },
  require: {
    label: 'Always include',
    summary: 'Every meal in the chosen days and meals includes a matching component.',
    compile: (p) => [slotCount(p.match, p.scope, p.strength, p.min)],
    describe: (p, n) => `Always include ${p.min > 1 ? `at least ${p.min} ` : ''}${describeMatcher(p.match, n)}${describeScope(p.scope)}${strengthWord(p.strength)}`,
    references: (p) => refsOf(p.match),
  },
  limit: {
    label: 'How often',
    summary: 'Bound how many matching components appear per meal, per day or per week.',
    compile: (p) => {
      if (p.per === 'meal') return [slotCount(p.match, p.scope, p.strength, p.min, p.max)];
      // Day groups can be scoped by day; meal restrictions (and all restrictions for weeks) filter what is counted.
      const groupBy: GroupBy = p.per === 'day' ? 'day' : 'plan';
      const daysAsGroups = p.per === 'day' && p.scope?.days;
      const select = all(p.match, ...scopeConditions(daysAsGroups ? { meals: p.scope?.meals } : p.scope));
      return [{ kind: 'count', select, groupBy, ...(daysAsGroups && { scope: { days: p.scope!.days } }), ...bounds(p.strength, p.min, p.max) }];
    },
    describe: (p, n) => {
      const range = p.min !== undefined && p.max !== undefined ? (p.min === p.max ? `exactly ${p.min}` : `${p.min}–${p.max}`)
        : p.min !== undefined ? `at least ${p.min}` : `at most ${p.max}`;
      // "Dishes with fish: at least 1 per day" reads correctly for any count.
      return `${sentence(describeMatcher(p.match, n))}: ${range} per ${p.per}${describeScope(p.scope)}${strengthWord(p.strength)}`;
    },
    references: (p) => refsOf(p.match),
  },
  no_repeat: {
    label: 'No repeats',
    summary: 'The same matching component is not used twice in the week, or within a number of days.',
    compile: (p) => [{
      kind: 'count',
      select: all(p.match, oneOf('role', p.roles), ...scopeConditions(p.scope)),
      groupBy: p.within === 'week' ? 'component' : ['component', { days: p.within }],
      ...bounds(p.strength, undefined, 1),
    }],
    describe: (p, n) => `Don't repeat ${describeMatcher(p.match, n)} ${p.within === 'week' ? 'in the week' : `within ${p.within} days`}${describeScope(p.scope)}${strengthWord(p.strength)}`,
    references: (p) => refsOf(p.match),
  },
  allowed_meals: {
    label: 'Only at certain meals',
    summary: 'Matching components may only be placed at the chosen meals.',
    compile: (p) => [{
      kind: 'count',
      select: all(p.match, not(oneOf('meal', p.meals)), ...scopeConditions({ days: p.days })),
      groupBy: 'slot',
      ...bounds(p.strength, undefined, 0),
    }],
    describe: (p, n) => sentence(`${describeMatcher(p.match, n)} only at ${p.meals.join(' or ')}${describeScope({ days: p.days })}${strengthWord(p.strength)}`),
    references: (p) => refsOf(p.match),
  },
  skip_when: {
    label: 'Leave out when',
    summary: 'When a meal contains a matching component, leave out the chosen roles.',
    compile: (p) => p.skip.map((role) => slotCount(is('role', role), p.scope, p.strength, undefined, 0, p.when)),
    describe: (p, n) => `With ${describeMatcher(p.when, n)}, no ${roleList(p.skip)}${describeScope(p.scope)}${strengthWord(p.strength)}`,
    references: (p) => refsOf(p.when),
  },
  require_with: {
    label: 'Also include when',
    summary: 'When a meal contains a matching component, it must also include the chosen components or extras.',
    compile: (p) => [
      ...p.components.map((id) => slotCount(is('id', id), p.scope, p.strength, 1, undefined, p.when)),
      ...p.extraCategories.map((cat) => slotCount(all(is('role', 'extra'), is('extra_category_id', cat)), p.scope, p.strength, 1, undefined, p.when)),
    ],
    describe: (p, n) => {
      const wanted = [
        ...p.components.map((id) => n.component?.(id) ?? `component #${id}`),
        ...p.extraCategories.map((id) => `an extra from ${n.extraCategory?.(id) ?? `category #${id}`}`),
      ];
      return `With ${describeMatcher(p.when, n)}, also include ${wanted.join(' and ')}${describeScope(p.scope)}${strengthWord(p.strength)}`;
    },
    references: (p) => {
      const r = refsOf(p.when);
      r.components.push(...p.components);
      r.extraCategories.push(...p.extraCategories);
      return r;
    },
  },
  prefer: {
    label: 'Prefer or avoid',
    summary: 'Nudge the planner towards or away from matching components without forbidding anything.',
    compile: (p) => [{ kind: 'prefer', select: p.match, weight: p.direction === 'prefer' ? -p.weight : p.weight }],
    describe: (p, n) => `${p.direction === 'prefer' ? 'Prefer' : 'Avoid'} ${describeMatcher(p.match, n)} (strength ${p.weight} of 5)`,
    references: (p) => refsOf(p.match),
  },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];

export function compileSpec(spec: RuleSpec): ConstraintBody[] {
  return (TEMPLATES[spec.template] as RuleTemplate<RuleSpec['params']>).compile(spec.params);
}
export function describeSpec(spec: RuleSpec, names: Names = {}): string {
  return (TEMPLATES[spec.template] as RuleTemplate<RuleSpec['params']>).describe(spec.params, names);
}
export function specReferences(spec: RuleSpec): Refs {
  return (TEMPLATES[spec.template] as RuleTemplate<RuleSpec['params']>).references(spec.params);
}
