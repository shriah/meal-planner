// Upgrade v24 only: a stored rule in the shapes of v14 to v23 (base, curry, subzi and extra as component types and
// roles, base and extra categories and curry types, a link's condition keyed by curry and subzi) rewritten to the shapes
// today's builders write (parts and categories by id). Links are modelled top to bottom: a dish that "comes with" a
// dish of a higher part becomes a dish added when that dish is in the meal. Pure; nothing here reads the database.
import { isLeaf, type Matcher, type PlannerPart } from '@/planner';
import { defaultRules, RuleSpecSchema, type RuleSpecInput } from '@/rules';
import type { ComponentType, CurryCategory } from '@/types/component';
import { defaultRules as legacyDefaultRules } from './legacy-rules';
import type { LegacyParts } from './parts';

export interface ConvertRulesContext {
  /** The part id of each converted type. */
  legacy: LegacyParts;
  /** The parts in meal order: a stock default is rebuilt over them, and they tell which way a link points. */
  parts: readonly PlannerPart[];
  /** The Curry-part category of each curry type a rule names. */
  curryCategory: ReadonlyMap<CurryCategory, number>;
  /** Each dish's part: its own `part_id`, or its type's part when it has none. */
  partOf: ReadonlyMap<number, number>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Params = Record<string, any>;

/** What a no-repeat without `roles` counted. */
const REPEAT_TYPES: ComponentType[] = ['base', 'curry', 'subzi'];

const isMatcher = (v: unknown): v is Matcher =>
  !!v && typeof v === 'object' && !Array.isArray(v) && ('field' in v || 'all' in v || 'any' in v || 'not' in v);

const partOfType = (type: unknown, ctx: ConvertRulesContext): number => {
  const part = ctx.legacy[type as ComponentType];
  if (part === undefined) throw new Error(`"${String(type)}" is not a part`);
  return part;
};

const curryCategoryOf = (type: unknown, ctx: ConvertRulesContext): number => {
  const id = ctx.curryCategory.get(type as CurryCategory);
  if (id === undefined) throw new Error(`the curry type "${String(type)}" has no category`);
  return id;
};

const mapValue = (value: unknown, f: (v: unknown) => number) => (Array.isArray(value) ? value.map(f) : f(value));

/** Every type leaf (`role`, `componentType`) as a `part` leaf and every category leaf as a `category` leaf, ops kept. */
function convertMatcher(m: Matcher, ctx: ConvertRulesContext): Matcher {
  if (isLeaf(m)) {
    const { field, op, value } = m as { field: string; op: string; value: unknown };
    if (field === 'role' || field === 'componentType') return { field: 'part', op, value: mapValue(value, (t) => partOfType(t, ctx)) } as Matcher;
    if (field === 'base_category_id' || field === 'extra_category_id') return { field: 'category', op, value } as Matcher;
    if (field === 'curry_category') return { field: 'category', op, value: mapValue(value, (t) => curryCategoryOf(t, ctx)) } as Matcher;
    return m;
  }
  if ('all' in m) return { all: m.all.map((x) => convertMatcher(x, ctx)) };
  if ('any' in m) return { any: m.any.map((x) => convertMatcher(x, ctx)) };
  return { not: convertMatcher(m.not, ctx) };
}

/** Part ids for a list of type names; a list already of part ids is kept. */
const partsOf = (types: unknown, ctx: ConvertRulesContext): unknown =>
  Array.isArray(types) ? types.map((t) => (typeof t === 'number' ? t : partOfType(t, ctx))) : types;

/** A "comes with" condition keyed by curry and subzi, keyed by part id; one already keyed by part is kept. */
function convertWhen(when: Params, ctx: ConvertRulesContext): Params {
  return Object.fromEntries(Object.entries(when).map(([k, ids]) => [/^\d+$/.test(k) ? k : String(partOfType(k, ctx)), ids]));
}

/** The part a link's `of` (or a serve link's `when`) names first, as `all(is('part', p), …)`. */
function firstPart(m: unknown): number | undefined {
  if (!isMatcher(m) || !('all' in m)) return undefined;
  const leaf = m.all[0];
  return leaf && isLeaf(leaf) && leaf.field === 'part' && leaf.op === 'eq' ? (leaf.value as number) : undefined;
}

/**
 * A comes link whose target part is above its owner's becomes a serve link: the owner is added when one of the
 * dishes is in the meal. Kept as a comes link when its owner is unknown (deleted) or not one dish, when it points
 * down or into the owner's own part, or when it also waits for another part, which a serve link cannot say: it then
 * plans as before, its dish form still shows it, and a link pointing the wrong way is named (Task 7).
 */
function flipUpward(params: Params, ctx: ConvertRulesContext): RuleSpecInput {
  const owner = params.match as Matcher;
  const ownerPart = isLeaf(owner) && owner.field === 'id' && owner.op === 'eq' ? ctx.partOf.get(owner.value as number) : undefined;
  const target = firstPart(params.of);
  const position = (part: number | undefined) => ctx.parts.findIndex((p) => p.id === part);
  const upward = ownerPart !== undefined && target !== undefined && position(target) >= 0 && position(target) < position(ownerPart);
  if (!upward || params.when) return { template: 'comes_with', params } as RuleSpecInput;
  const { match, of, ...rest } = params;
  return { template: 'require_with', params: { when: of, components: [(match as { value: number }).value], categories: [], ...rest } } as RuleSpecInput;
}

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const sortKeys = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Params)[k])]));
};

function convert(spec: { template: string; params: Params }, ctx: ConvertRulesContext, defaultKey: string | undefined): RuleSpecInput {
  // A stock default (as v14–v23 stored it, or already over the parts) reads as today's stock default over the parts.
  // The extras limits are stock at any maximum.
  if (defaultKey !== undefined) {
    const max = typeof spec.params.max === 'number' ? spec.params.max : undefined;
    const limits = max === undefined ? undefined : { breakfast: max, lunch: max, dinner: max };
    const today = defaultRules(ctx.parts, limits).find((r) => r.default_key === defaultKey)?.spec;
    const before = legacyDefaultRules(limits).find((r) => r.default_key === defaultKey)?.spec;
    if (today && (sameValue(spec, today) || sameValue(spec, before))) return today;
  }

  const params: Params = {};
  for (const [k, v] of Object.entries(spec.params)) {
    if (spec.template === 'comes_with' && k === 'when') params.when = convertWhen(v as Params, ctx);
    else params[k] = isMatcher(v) ? convertMatcher(v, ctx) : v;
  }
  switch (spec.template) {
    case 'only_allow':
      if ('roles' in params) {
        params.parts = partsOf(params.roles, ctx);
        delete params.roles;
      }
      break;
    case 'skip_when':
      params.skip = partsOf(params.skip, ctx);
      break;
    case 'no_repeat':
      // Without roles it counted bases, curries and subzis; today a no-repeat without parts counts every part.
      if (!('parts' in params)) params.parts = partsOf(params.roles ?? REPEAT_TYPES, ctx);
      delete params.roles;
      break;
    case 'require_with':
      if ('extraCategories' in params) {
        params.categories = params.extraCategories;
        delete params.extraCategories;
      }
      break;
    case 'pairs_with':
      if ('baseCategories' in params) {
        params.categories = params.baseCategories;
        delete params.baseCategories;
      }
      break;
    case 'comes_with':
      return flipUpward(params, ctx);
  }
  return { template: spec.template, params } as RuleSpecInput;
}

/**
 * The spec in today's shapes, or why it cannot be converted (the rule then keeps its old spec, and `compileRules`
 * names it). `defaultKey` is the rule's: a stock default is rebuilt exactly as `defaultRules(parts)` writes it. Ids of
 * deleted dishes and categories are kept, so `compileRules` still names them.
 */
export function convertRuleSpec(spec: unknown, ctx: ConvertRulesContext, defaultKey?: string): { spec: RuleSpecInput } | { skipped: string } {
  try {
    if (!spec || typeof spec !== 'object' || typeof (spec as Params).template !== 'string' || typeof (spec as Params).params !== 'object') {
      return { skipped: 'it is not a rule' };
    }
    const out = convert(spec as { template: string; params: Params }, ctx, defaultKey);
    const parsed = RuleSpecSchema.safeParse(out);
    if (!parsed.success) return { skipped: `${parsed.error.issues[0].path.join('.') || 'rule'}: ${parsed.error.issues[0].message}` };
    return { spec: out };
  } catch (e) {
    // An upgrade must never fail on a row it cannot read: any surprise leaves the rule as it was.
    return { skipped: e instanceof Error ? e.message : String(e) };
  }
}

/** The curry types a spec names in `curry_category` leaves (a link's values included), each once. */
export function curryTypesNamed(spec: unknown): CurryCategory[] {
  const out = new Set<CurryCategory>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      const o = node as Params;
      if (o.field === 'curry_category') [o.value].flat().forEach((t) => out.add(t as CurryCategory));
      else Object.values(o).forEach(walk);
    }
  };
  walk(spec);
  return [...out];
}
