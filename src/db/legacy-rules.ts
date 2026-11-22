// FROZEN. Copies of the rule builders as they stood when the Dexie upgrades v14 to v22 were written: what those
// upgrades wrote (base, curry, subzi and extra as `componentType` values, `when.curry` / `when.subzi`, the names of
// the default rules). Never change them to follow `src/rules`, which moves on. Only `src/db/client.ts` (upgrades
// v14 to v22) and its tests import this file. It may use the planner's matcher builders and zod, which keep their
// meaning, but never `src/rules`.
import { all, DAYS, MEALS, is, isLeaf, not, oneOf, type Day, type Matcher, type Meal } from '@/planner';
import type { ComponentType, CurryCategory } from '@/types/component';

/** The stored shape of a rule as these builders read and write it. */
export interface LegacyRuleRecord {
  id: number;
  name: string;
  enabled: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spec: { template: string; params: Record<string, any> };
  created_at: string;
  default_key?: string;
  owner_component_id?: number;
}

export type OwnedRule = Omit<LegacyRuleRecord, 'id' | 'enabled' | 'created_at'> & { owner_component_id: number };
export type DefaultRule = Omit<LegacyRuleRecord, 'id' | 'enabled' | 'created_at'> & { default_key: string };

// ─── Strength ─────────────────────────────────────────────────────────────────

/** The soft cost each non-hard strength writes. */
const STRENGTH_COST = { usually: 10, moderately: 6, sometimes: 3 } as const;

type LinkStrength = 'always' | 'usually' | 'moderately' | 'sometimes';

const strengthParams = (strength: LinkStrength) =>
  strength === 'always' ? { strength: 'must' as const } : { strength: 'prefer' as const, cost: STRENGTH_COST[strength] };

/** The strength a rule's params stand for. Hand-edited costs fall in bands: 8 or more usually, 5 to 7 moderately. */
export const strengthOf = (params: { strength?: string; cost?: number }): LinkStrength => {
  if (params.strength !== 'prefer') return 'always';
  const cost = params.cost ?? 10;
  return cost >= 8 ? 'usually' : cost >= 5 ? 'moderately' : 'sometimes';
};

// ─── Links ────────────────────────────────────────────────────────────────────

const LINK_TARGETS = ['base_category', 'extra_category', 'curry_category', 'base_dish', 'curry_dish', 'subzi_dish', 'extra_dish'] as const;
type LinkTarget = (typeof LINK_TARGETS)[number];
type LinkValue = number | string;
const SERVE_TARGETS = ['base_category', 'base_dish'] as const;
type ServeTarget = (typeof SERVE_TARGETS)[number];
type SideTarget = Exclude<LinkTarget, 'base_category' | 'base_dish'>;
const isSideTarget = (t: LinkTarget): t is SideTarget => t !== 'base_category' && t !== 'base_dish';
type LinkMode = 'with' | 'never' | 'serve' | 'comes';
type LinkSlot = `${'with' | 'never'}:${LinkTarget}` | `serve:${ServeTarget}` | `comes:${SideTarget}`;
type OwnedSlot = 'allowed_days' | 'allowed_meals' | 'exclude' | LinkSlot;
interface LinkScope { days?: Day[]; meals?: Meal[] }
interface LinkWhen { curry?: number[]; subzi?: number[] }
export interface DishLink {
  mode: LinkMode; target: LinkTarget; values: LinkValue[]; strength: LinkStrength; scope?: LinkScope
  when?: LinkWhen
  ruleId?: number
}
type LinkInput = Omit<DishLink, 'strength'> & { strength?: LinkStrength };

/** The stored form of a scope: empty lists dropped (the schema refuses them), and nothing when nothing is left. */
const scopeParams = (scope: LinkScope | undefined): { scope?: LinkScope } => {
  const out: LinkScope = {};
  if (scope?.days?.length) out.days = [...scope.days];
  if (scope?.meals?.length) out.meals = [...scope.meals];
  return out.days || out.meals ? { scope: out } : {};
};

const LINK_FIELD = {
  base_category: 'base_category_id', extra_category: 'extra_category_id', curry_category: 'curry_category',
  base_dish: 'id', curry_dish: 'id', subzi_dish: 'id', extra_dish: 'id',
} as const;
const LINK_DISH_TYPE = {
  base_category: 'base', extra_category: 'extra', curry_category: 'curry',
  base_dish: 'base', curry_dish: 'curry', subzi_dish: 'subzi', extra_dish: 'extra',
} as const;
const isDishTarget = (t: LinkTarget): t is 'base_dish' | 'curry_dish' | 'subzi_dish' | 'extra_dish' => LINK_FIELD[t] === 'id';

const NAME_SUFFIX: Partial<Record<string, string>> = {
  'with:base_category': 'base pairing',
  'with:extra_category': 'only with these extras',
  'with:curry_category': 'only with these curry types',
  'never:base_category': 'not with these bases',
  'never:extra_category': 'not with these extras',
  'never:curry_category': 'not with these curries',
  'serve:base_category': 'served with these bases',
  'serve:base_dish': 'served with these bases',
  'comes:extra_category': 'comes with',
  'comes:curry_category': 'comes with',
  'comes:curry_dish': 'comes with',
  'comes:subzi_dish': 'comes with',
  'comes:extra_dish': 'comes with',
  allowed_days: 'only on certain days',
  allowed_meals: 'only at certain meals',
  exclude: 'never planned automatically',
};

const ownedRuleName = (slot: string, componentName: string): string =>
  `${componentName}: ${NAME_SUFFIX[slot] ?? 'rule'}`;

export function pairingRule(component: { id: number; name: string }, baseCategories: readonly number[], strength: LinkStrength = 'always', scope?: LinkScope): OwnedRule {
  return {
    name: ownedRuleName('with:base_category', component.name),
    spec: { template: 'pairs_with', params: { match: is('id', component.id), baseCategories: [...baseCategories], ...scopeParams(scope), ...strengthParams(strength) } },
    owner_component_id: component.id,
  };
}

/** Base categories a pairing rule allows, or undefined when the rule is not a pairing. */
export function pairingCategories(rule: Pick<LegacyRuleRecord, 'spec'>): number[] | undefined {
  return rule.spec.template === 'pairs_with' ? [...(rule.spec.params.baseCategories ?? [])] : undefined;
}

/** The stored form of a condition: empty parts dropped, and nothing when nothing is left. */
function cleanWhen(when: LinkWhen | undefined): LinkWhen | undefined {
  const out: LinkWhen = {};
  if (when?.curry?.length) out.curry = [...when.curry];
  if (when?.subzi?.length) out.subzi = [...when.subzi];
  return out.curry || out.subzi ? out : undefined;
}

/** A link rule: the dish goes only with (or never with) the given categories of another kind of dish. */
export function linkRule(component: { id: number; name: string }, link: LinkInput): OwnedRule {
  const { mode, target, values, strength = 'always', scope } = link;
  if (mode === 'serve') {
    const when = all(is('componentType', 'base'), oneOf(LINK_FIELD[target], [...values] as never));
    return {
      name: ownedRuleName(`serve:${target}`, component.name),
      spec: { template: 'require_with', params: { when, components: [component.id], extraCategories: [], ...scopeParams(scope), ...strengthParams(strength) } },
      owner_component_id: component.id,
    };
  }
  if (mode === 'comes') {
    if (!isSideTarget(target)) throw new Error(`a dish cannot come with ${target}`);
    const when = cleanWhen(link.when);
    if (when && (target === 'curry_dish' || target === 'curry_category' || (target === 'subzi_dish' && when.subzi))) {
      throw new Error('a link cannot bring a dish into a part it waits for');
    }
    const of = all(is('componentType', LINK_DISH_TYPE[target]), oneOf(LINK_FIELD[target], [...values] as never));
    return {
      name: ownedRuleName(`comes:${target}`, component.name),
      spec: { template: 'comes_with', params: { match: is('id', component.id), of, ...(when && { when }), ...scopeParams(scope), ...strengthParams(strength) } },
      owner_component_id: component.id,
    };
  }
  if (mode === 'with' && target === 'base_category') return pairingRule(component, values as number[], strength, scope);
  // A dish is never kept away from itself, so "only with" lists it too (it is dropped again on reading).
  const listed = mode === 'with' && isDishTarget(target) ? [...new Set([...values, component.id])] : [...values];
  const set = oneOf(LINK_FIELD[target], listed as never);
  const of = all(is('componentType', LINK_DISH_TYPE[target]), mode === 'never' ? set : not(set));
  return {
    name: ownedRuleName(`${mode}:${target}`, component.name),
    spec: { template: 'avoid_with', params: { match: is('id', component.id), with: of, ...scopeParams(scope), ...strengthParams(strength) } },
    owner_component_id: component.id,
  };
}

/** The link a rule makes, or undefined when the rule is not a link. */
export function readLink(rule: Pick<LegacyRuleRecord, 'spec'>): DishLink | undefined {
  const scoped = (link: DishLink): DishLink => {
    const { scope } = scopeParams((rule.spec.params as { scope?: LinkScope }).scope);
    return scope ? { ...link, scope } : link;
  };
  if (rule.spec.template === 'pairs_with') return scoped({ mode: 'with', target: 'base_category', values: [...(rule.spec.params.baseCategories ?? [])], strength: strengthOf(rule.spec.params) });
  if (rule.spec.template === 'require_with') {
    const p = rule.spec.params;
    if ((p.components ?? []).length !== 1 || (p.extraCategories ?? []).length > 0) return undefined;
    const when = p.when as Matcher;
    if (!('all' in when) || when.all.length !== 2) return undefined;
    const [kind, set] = when.all;
    if (!isLeaf(kind) || kind.field !== 'componentType' || kind.value !== 'base' || !isLeaf(set)) return undefined;
    const target = SERVE_TARGETS.find((t) => LINK_FIELD[t] === set.field);
    if (!target) return undefined;
    return scoped({ mode: 'serve', target, values: [set.value].flat() as LinkValue[], strength: strengthOf(p) });
  }
  if (rule.spec.template === 'comes_with') {
    const p = rule.spec.params;
    const of = p.of as Matcher;
    if (!('all' in of) || of.all.length !== 2) return undefined;
    const [kind, set] = of.all;
    if (!isLeaf(kind) || kind.field !== 'componentType' || !isLeaf(set)) return undefined;
    const target = LINK_TARGETS.find((t) => isSideTarget(t) && LINK_DISH_TYPE[t] === kind.value && LINK_FIELD[t] === set.field);
    if (!target) return undefined;
    const when = p.when && { ...(p.when.curry && { curry: [...p.when.curry] }), ...(p.when.subzi && { subzi: [...p.when.subzi] }) };
    return scoped({ mode: 'comes', target, values: [set.value].flat() as LinkValue[], strength: strengthOf(p), ...(when && { when }) });
  }
  if (rule.spec.template !== 'avoid_with') return undefined;
  const side = rule.spec.params.with as Matcher;
  if (!('all' in side) || side.all.length !== 2) return undefined;
  const [kind, set] = side.all;
  if (!isLeaf(kind) || kind.field !== 'componentType') return undefined;
  const negated = 'not' in set;
  const leaf = negated ? set.not : set;
  if (!isLeaf(leaf)) return undefined;
  const target = LINK_TARGETS.find((t) => LINK_DISH_TYPE[t] === kind.value && LINK_FIELD[t] === leaf.field);
  if (!target) return undefined;
  let values = [leaf.value].flat() as LinkValue[];
  if (negated && isDishTarget(target)) {
    const owner = rule.spec.params.match as Matcher;
    if (isLeaf(owner) && owner.field === 'id') values = values.filter((v) => v !== owner.value);
  }
  return scoped({ mode: negated ? 'with' : 'never', target, values, strength: strengthOf(rule.spec.params) });
}

/** Which owned slot a rule fills, or undefined when it is not one a dish form edits. */
export function ownedSlot(rule: Pick<LegacyRuleRecord, 'spec'>): OwnedSlot | undefined {
  const t = rule.spec.template;
  if (t === 'pairs_with' || t === 'avoid_with' || t === 'require_with' || t === 'comes_with') {
    const link = readLink(rule);
    return link && (`${link.mode}:${link.target}` as LinkSlot);
  }
  return t === 'allowed_days' || t === 'allowed_meals' || t === 'exclude' ? t : undefined;
}

/** The curry types an extra never goes with. */
export const curryClashRule = (component: { id: number; name: string }, curryCategories: readonly CurryCategory[]): OwnedRule =>
  linkRule(component, { mode: 'never', target: 'curry_category', values: [...curryCategories] });

export function dayRule(component: { id: number; name: string }, days: readonly Day[]): OwnedRule {
  return {
    name: ownedRuleName('allowed_days', component.name),
    spec: { template: 'allowed_days', params: { match: is('id', component.id), days: [...days], strength: 'must' } },
    owner_component_id: component.id,
  };
}

/** The dish is never planned automatically; it can still be picked by hand, as an override. */
export function exclusionRule(component: { id: number; name: string }): OwnedRule {
  return {
    name: ownedRuleName('exclude', component.name),
    spec: { template: 'exclude', params: { match: is('id', component.id), strength: 'must' } },
    owner_component_id: component.id,
  };
}

// ─── Default rules ────────────────────────────────────────────────────────────

/** Extras per meal when a library has never set its own limits. */
export const DEFAULT_EXTRA_LIMITS: Record<Meal, number> = { breakfast: 2, lunch: 3, dinner: 2 };

const SIDE_COST = 2;
const REUSE_COST = 2;
const CLOSE_REPEAT_COST = 3;

export function defaultRules(extraLimits: Record<Meal, number> = DEFAULT_EXTRA_LIMITS): DefaultRule[] {
  const dishes = oneOf('componentType', ['base', 'curry', 'subzi']);
  return [
    ...MEALS.map((meal): DefaultRule => ({
      default_key: `extras-limit-${meal}`,
      name: `Extras at ${meal}: at most ${extraLimits[meal]}`,
      spec: { template: 'limit', params: { match: is('componentType', 'extra'), per: 'meal', max: extraLimits[meal], scope: { meals: [meal] }, strength: 'must' } },
    })),
    {
      default_key: 'variety',
      name: 'Vary dishes across the week',
      spec: { template: 'no_repeat', params: { match: dishes, within: 'week', strength: 'prefer', cost: REUSE_COST } },
    },
    {
      default_key: 'spacing',
      name: 'No dish on the same or next day',
      spec: { template: 'no_repeat', params: { match: dishes, within: 2, strength: 'prefer', cost: CLOSE_REPEAT_COST } },
    },
    {
      default_key: 'sides-only-when-asked',
      name: 'Curries, subzis and extras only when a rule asks for them',
      spec: { template: 'prefer', params: { match: oneOf('componentType', ['curry', 'subzi', 'extra']), direction: 'avoid', weight: SIDE_COST } },
    },
    {
      default_key: 'prefer-frequent',
      name: 'Prefer frequent dishes',
      spec: { template: 'prefer', params: { match: is('frequency', 'frequent'), direction: 'prefer', weight: 1 } },
    },
    {
      default_key: 'avoid-rare',
      name: 'Avoid rare dishes',
      spec: { template: 'prefer', params: { match: is('frequency', 'rare'), direction: 'avoid', weight: 1 } },
    },
  ];
}

/** A meal holds one curry and one subzi: two hand-written Always rules (no default key, no owner). */
export function capRules(): Omit<LegacyRuleRecord, 'id' | 'enabled' | 'created_at'>[] {
  const caps = [['Curry', 'curry'], ['Subzi', 'subzi']] as const;
  return caps.map(([name, type]) => ({
    name: `At most one ${name} per meal`,
    spec: { template: 'limit', params: { match: is('componentType', type satisfies ComponentType), per: 'meal', max: 1, strength: 'must' } },
  }));
}

/** The default a stored rule was created as, recognised by its name, for rules stored before keys existed. */
export function defaultKeyForName(name: string): string | undefined {
  const limit = /^Extras at (breakfast|lunch|dinner): at most \d+$/.exec(name);
  if (limit) return `extras-limit-${limit[1]}`;
  return defaultRules().find((r) => r.name === name)?.default_key ?? RETIRED_DEFAULT_NAMES[name];
}

/** Defaults an older library may still hold, by their original name; v18 switches them off or replaces them. */
const RETIRED_DEFAULT_NAMES: Record<string, string> = {
  'A curry in every meal': 'want-curry',
  'A subzi in every meal': 'want-subzi',
  'Extras only when a rule asks for them': 'extras-only-when-asked',
};

const WEEKDAYS: Day[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const WEEKEND: Day[] = ['saturday', 'sunday'];

/** The days a dish's old calendar occasion tags allowed, or undefined for any day. */
export function legacyOccasionDays(tags: readonly string[]): Day[] | undefined {
  if (tags.includes('everyday')) return undefined;
  if (tags.includes('weekday')) return WEEKDAYS;
  if (tags.includes('weekend')) return WEEKEND;
  const named = DAYS.filter((d) => tags.includes(d));
  return named.length ? named : undefined;
}

/** Calendar occasion tags, which are now `allowed_days` rules the dish owns. */
export const LEGACY_CALENDAR_TAGS: readonly string[] = ['everyday', 'weekday', 'weekend', ...DAYS];
