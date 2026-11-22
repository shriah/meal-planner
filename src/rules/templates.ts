// Rule templates: the user-facing rule types. Each compiles to planner constraints, describes
// itself, and lists the ids it references. Adding a rule type means adding a template here.
import { z } from 'zod';
import {
  DAYS, MEALS, MatcherSchema, all, is, isLeaf, not, oneOf,
  type Bounds, type Constraint, type GroupBy, type Matcher,
} from '@/planner';
import { describeMatcher, describeScope, describeWhen, partNames, type Names } from './describe';
import { nearestLevel } from './levels';

// ─── Shared params ────────────────────────────────────────────────────────────

export const ScopeSchema = z
  .object({ days: z.array(z.enum(DAYS)).min(1).optional(), meals: z.array(z.enum(MEALS)).min(1).optional() })
  .strict();
export type Scope = z.infer<typeof ScopeSchema>;

/** `must` rules are hard; `prefer` rules are soft and may be broken when they conflict with others. */
const StrengthSchema = z.enum(['must', 'prefer']).default('must');
export type Strength = z.infer<typeof StrengthSchema>;

/**
 * Soft cost per unit for `prefer` rules without their own `cost`. The default preferences (want a
 * curry, variety, …) set lower costs, so a user's preference wins over them unless told otherwise.
 */
export const PREFER_COST = 10;

/** How much breaking a `prefer` rule costs per unit, 1–10; PREFER_COST when left out. Ignored for `must`. */
const CostSchema = z.number().int().min(1).max(10).optional();

const count = z.number().int().min(0);
const ids = z.array(z.number().int());
/** Part ids, at least one. */
const partIds = z.array(z.number().int()).min(1);

// ─── Params per template ──────────────────────────────────────────────────────

const ExcludeParams = z.object({ match: MatcherSchema, scope: ScopeSchema.optional(), strength: StrengthSchema, cost: CostSchema }).strict();

const OnlyAllowParams = z
  .object({ match: MatcherSchema, parts: partIds, scope: ScopeSchema.optional(), strength: StrengthSchema, cost: CostSchema })
  .strict();

const RequireParams = z
  .object({ match: MatcherSchema, min: z.number().int().min(1).default(1), scope: ScopeSchema.optional(), strength: StrengthSchema, cost: CostSchema })
  .strict();

const LimitParams = z
  .object({
    match: MatcherSchema,
    per: z.enum(['meal', 'day', 'week']),
    min: count.optional(),
    max: count.optional(),
    scope: ScopeSchema.optional(),
    strength: StrengthSchema, cost: CostSchema,
  })
  .strict()
  .refine((p) => p.min !== undefined || p.max !== undefined, { message: 'set a minimum, a maximum, or both', path: ['max'] })
  .refine((p) => p.min === undefined || p.max === undefined || p.min <= p.max, { message: 'minimum must not exceed maximum', path: ['min'] });

const NoRepeatParams = z
  .object({
    match: MatcherSchema,
    /** `week`: at most once in the week; a number k: not again within k consecutive days. */
    within: z.union([z.literal('week'), z.number().int().min(2).max(DAYS.length - 1)]).default('week'),
    /** The parts counted; every part when left out. */
    parts: partIds.optional(),
    scope: ScopeSchema.optional(),
    strength: StrengthSchema, cost: CostSchema,
  })
  .strict();

const AllowedMealsParams = z
  .object({ match: MatcherSchema, meals: z.array(z.enum(MEALS)).min(1), days: z.array(z.enum(DAYS)).min(1).optional(), strength: StrengthSchema, cost: CostSchema })
  .strict();

const SkipWhenParams = z
  // The parts left out; never the first part, which `compileRules` checks against the parts.
  .object({ when: MatcherSchema, skip: partIds, scope: ScopeSchema.optional(), strength: StrengthSchema, cost: CostSchema })
  .strict();

const RequireWithParams = z
  .object({
    when: MatcherSchema,
    components: ids.default([]),
    extraCategories: ids.default([]),
    scope: ScopeSchema.optional(),
    strength: StrengthSchema, cost: CostSchema,
  })
  .strict()
  .refine((p) => p.components.length + p.extraCategories.length > 0, { message: 'choose at least one component or extra category', path: ['components'] });

const PairsWithParams = z
  .object({ match: MatcherSchema, baseCategories: ids.min(1), scope: ScopeSchema.optional(), strength: StrengthSchema, cost: CostSchema })
  .strict();

const ids1 = z.array(z.number().int()).min(1);
/** The curry and subzi a "comes with" link waits for: both parts must hold, any one dish of a part will do. */
const WhenSchema = z.object({ curry: ids1.optional(), subzi: ids1.optional() }).strict()
  .refine((w) => w.curry !== undefined || w.subzi !== undefined, { message: 'name a curry or a subzi' });

const ComesWithParams = z
  .object({ match: MatcherSchema, of: MatcherSchema, when: WhenSchema.optional(), scope: ScopeSchema.optional(), strength: StrengthSchema, cost: CostSchema })
  .strict()
  // The scorer takes the pair's role from the first candidate, so `of` must pin one kind of dish.
  .refine((p) => 'all' in p.of && p.of.all.length >= 1 && isLeaf(p.of.all[0]) && p.of.all[0].field === 'componentType' && p.of.all[0].op === 'eq',
    { message: 'name one kind of dish first, then the dishes', path: ['of'] })
  .refine((p) => {
    if (!p.when) return true;
    const kind = 'all' in p.of && isLeaf(p.of.all[0]) ? p.of.all[0].value : undefined;
    return kind !== 'curry' && !(kind === 'subzi' && p.when.subzi);
  }, { message: 'a link cannot bring a dish into a part it waits for', path: ['when'] });

const AllowedDaysParams = z
  .object({ match: MatcherSchema, days: z.array(z.enum(DAYS)).min(1), strength: StrengthSchema, cost: CostSchema })
  .strict();

const AvoidWithParams = z
  .object({ match: MatcherSchema, with: MatcherSchema, scope: ScopeSchema.optional(), strength: StrengthSchema, cost: CostSchema })
  .strict();

const PreferParams = z
  .object({ match: MatcherSchema, direction: z.enum(['prefer', 'avoid']), weight: z.number().int().min(1).max(10).default(2) })
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
  z.object({ template: z.literal('pairs_with'), params: PairsWithParams }).strict(),
  z.object({ template: z.literal('comes_with'), params: ComesWithParams }).strict(),
  z.object({ template: z.literal('avoid_with'), params: AvoidWithParams }).strict(),
  z.object({ template: z.literal('allowed_days'), params: AllowedDaysParams }).strict(),
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

/** The dishes, categories and parts a rule names by id. */
export interface Refs { components: number[]; categories: number[]; parts: number[] }

function matcherRefs(m: Matcher, out: Refs): Refs {
  if (isLeaf(m)) {
    const values = (Array.isArray(m.value) ? m.value : [m.value]) as number[];
    if (m.field === 'id') out.components.push(...values);
    else if (m.field === 'category' || m.field === 'base_category_id' || m.field === 'extra_category_id') out.categories.push(...values);
    else if (m.field === 'part') out.parts.push(...values);
  } else if ('all' in m) m.all.forEach((x) => matcherRefs(x, out));
  else if ('any' in m) m.any.forEach((x) => matcherRefs(x, out));
  else matcherRefs(m.not, out);
  return out;
}
const refsOf = (...ms: Matcher[]): Refs => ms.reduce((acc, m) => matcherRefs(m, acc), { components: [], categories: [], parts: [] } as Refs);
/** The refs of `ms` with `parts` added. */
const withParts = (parts: readonly number[] | undefined, ...ms: Matcher[]): Refs => {
  const r = refsOf(...ms);
  r.parts.push(...(parts ?? []));
  return r;
};

/** One matcher per part of a link's condition, curry first. */
const whenMatchers = (when: { curry?: number[]; subzi?: number[] }): Matcher[] =>
  (['curry', 'subzi'] as const).filter((part) => when[part]).map((part) => all(is('role', part), oneOf('id', when[part]!)));

const strengthWord = (s: Strength) => (s === 'must' ? '' : ' (preferred)');
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "curries, subzis and extras". */
const partList = (parts: readonly number[], names: Names) => {
  const words = partNames(parts, names);
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
    compile: (p) => p.parts.map((part) => slotCount(all(is('part', part), not(p.match)), p.scope, p.strength, undefined, 0)),
    describe: (p, n) => `${sentence(partList(p.parts, n))}${describeScope(p.scope)}: only ${describeMatcher(p.match, n)}${strengthWord(p.strength)}`,
    references: (p) => withParts(p.parts, p.match),
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
      // An upper bound counted over days or the week is how often a dish appears.
      return [{ kind: 'count', select, groupBy, ...(daysAsGroups && { scope: { days: p.scope!.days } }), ...bounds(p.strength, p.min, p.max), ...(p.max !== undefined && { level: 'frequency' as const }) }];
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
      select: all(p.match, ...(p.parts ? [oneOf('part', p.parts)] : []), ...scopeConditions(p.scope)),
      groupBy: p.within === 'week' ? 'component' : ['component', { days: p.within }],
      ...bounds(p.strength, undefined, 1),
      level: 'frequency',
    }],
    describe: (p, n) => `Don't repeat ${describeMatcher(p.match, n)} ${p.within === 'week' ? 'in the week' : `within ${p.within} days`}${describeScope(p.scope)}${strengthWord(p.strength)}`,
    references: (p) => withParts(p.parts, p.match),
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
    compile: (p) => p.skip.map((part) => slotCount(is('part', part), p.scope, p.strength, undefined, 0, p.when)),
    describe: (p, n) => `With ${describeMatcher(p.when, n)}, no ${partList(p.skip, n)}${describeScope(p.scope)}${strengthWord(p.strength)}`,
    references: (p) => withParts(p.skip, p.when),
  },
  require_with: {
    label: 'Also include when',
    summary: 'When a meal contains a matching component, it must also include the chosen components or extras.',
    compile: (p) => [
      // A pairing is a pair constraint, which carries its own cost; `compileSpec` leaves it alone.
      ...p.components.map((component): ConstraintBody => ({
        kind: 'pair', when: p.when, of: is('id', component), ...(p.scope && { scope: p.scope }), strength: p.strength,
        ...(p.strength === 'prefer' && { cost: p.cost ?? PREFER_COST }),
      })),
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
      r.categories.push(...p.extraCategories);
      return r;
    },
  },
  comes_with: {
    label: 'Comes with',
    summary: 'When a meal contains a matching dish, it must also include one of the dishes named.',
    compile: (p) => [{
      kind: 'pair', when: p.match, of: p.of, ...(p.when && { inMeal: whenMatchers(p.when) }), ...(p.scope && { scope: p.scope }), strength: p.strength,
      ...(p.strength === 'prefer' && { cost: p.cost ?? PREFER_COST }),
    }],
    describe: (p, n) => {
      const several = 'all' in p.of && p.of.all.some((m) => isLeaf(m) && m.field === 'id' && Array.isArray(m.value) && m.value.length > 1);
      const when = p.when ? ` when ${describeWhen(p.when, (id) => n.component?.(id) ?? `component #${id}`)}` : '';
      return `With ${describeMatcher(p.match, n)}, also ${several ? 'one of ' : ''}${describeMatcher(p.of, n)}${when}${describeScope(p.scope)}${strengthWord(p.strength)}`;
    },
    references: (p) => refsOf(p.match, p.of, ...(p.when ? whenMatchers(p.when) : [])),
  },
  pairs_with: {
    label: 'Only with these bases',
    summary: 'Matching dishes only share a meal with a base from the chosen categories.',
    // A base without a category is outside every list.
    compile: (p) => [slotCount(
      all(p.match, not(is('role', 'base'))), p.scope, p.strength, undefined, 0,
      all(is('role', 'base'), not(oneOf('base_category_id', p.baseCategories))),
    )],
    describe: (p, n) => {
      const bases = p.baseCategories.map((id) => n.baseCategory?.(id) ?? `base category #${id}`);
      return `${sentence(describeMatcher(p.match, n))} only with ${bases.join(' or ')} bases${describeScope(p.scope)}${strengthWord(p.strength)}`;
    },
    references: (p) => {
      const r = refsOf(p.match);
      r.categories.push(...p.baseCategories);
      return r;
    },
  },
  allowed_days: {
    label: 'Only on certain days',
    summary: 'Matching dishes may only be placed on the chosen days.',
    compile: (p) => [slotCount(all(p.match, not(oneOf('day', p.days))), undefined, p.strength, undefined, 0)],
    describe: (p, n) => sentence(`${describeMatcher(p.match, n)} only${describeScope({ days: p.days })}${strengthWord(p.strength)}`),
    references: (p) => refsOf(p.match),
  },
  avoid_with: {
    label: 'Never together',
    summary: 'Matching dishes never share a meal with the other dishes.',
    // A dish matching both sides is its own trigger, so keep the two sides apart.
    compile: (p) => [slotCount(p.match, p.scope, p.strength, undefined, 0, p.with)],
    describe: (p, n) => `${sentence(describeMatcher(p.match, n))} never with ${describeMatcher(p.with, n)}${describeScope(p.scope)}${strengthWord(p.strength)}`,
    references: (p) => refsOf(p.match, p.with),
  },
  prefer: {
    label: 'Prefer or avoid',
    summary: 'Nudge the planner towards or away from matching components without forbidding anything.',
    compile: (p) => [{ kind: 'prefer', select: p.match, weight: p.direction === 'prefer' ? -p.weight : p.weight, level: 'frequency' }],
    describe: (p, n) => `${p.direction === 'prefer' ? 'Prefer' : 'Avoid'} ${describeMatcher(p.match, n)} (${nearestLevel(p.weight).label.toLowerCase()})`,
    references: (p) => refsOf(p.match),
  },
};

/** Templates a dish's own links write; not offered on the Rules page or to the assistant. */
export const OWNED_ONLY_TEMPLATES: TemplateId[] = ['comes_with'];

export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];
/** The templates a person or the assistant may author by hand. */
export const HAND_TEMPLATE_IDS = TEMPLATE_IDS.filter((t) => !OWNED_ONLY_TEMPLATES.includes(t));

/** Rule types grouped by what they do, for the type picker. Every type appears exactly once. */
export const TEMPLATE_GROUPS: { label: string; templates: TemplateId[] }[] = [
  { label: 'Where and when', templates: ['allowed_meals', 'allowed_days', 'only_allow'] },
  { label: 'Keep out', templates: ['exclude', 'skip_when', 'avoid_with'] },
  { label: 'Pair and require', templates: ['require', 'require_with', 'pairs_with'] },
  { label: 'Count and spread', templates: ['limit', 'no_repeat'] },
  { label: 'Preference', templates: ['prefer'] },
];

export function compileSpec(spec: RuleSpec): ConstraintBody[] {
  const bodies = (TEMPLATES[spec.template] as RuleTemplate<RuleSpec['params']>).compile(spec.params);
  const cost = 'cost' in spec.params ? spec.params.cost : undefined;
  if (cost === undefined) return bodies;
  return bodies.map((b) => (b.kind === 'count' && b.costs ? { ...b, costs: { min: cost, max: cost } } : b));
}
export function describeSpec(spec: RuleSpec, names: Names = {}): string {
  return (TEMPLATES[spec.template] as RuleTemplate<RuleSpec['params']>).describe(spec.params, names);
}
export function specReferences(spec: RuleSpec): Refs {
  return (TEMPLATES[spec.template] as RuleTemplate<RuleSpec['params']>).references(spec.params);
}
