// Rules a component owns: edited on the component's form, stored as ordinary rules, at most one per
// slot. Any dish may own "goes with" / "never with" links to the categories of another kind (base
// categories, extra categories, curry types): a goes-with link to base categories is a `pairs_with` rule,
// every other link an `avoid_with` rule. A dish also owns the days it may be planned on (`allowed_days`),
// the meals (`allowed_meals`) and whether it is planned automatically at all (`exclude`).
import { all, DAYS, MEALS, is, isLeaf, not, oneOf, type Day, type Matcher, type Meal } from '@/planner';
import type { ComponentType, CurryCategory } from '@/types/component';
import type { RuleRecord } from './record';

export type OwnedRule = Omit<RuleRecord, 'id' | 'enabled' | 'created_at'> & { owner_component_id: number };

// ─── Links: goes with / never with ────────────────────────────────────────────

/** What a link points at: the categories of another kind of dish. */
export const LINK_TARGETS = ['base_category', 'extra_category', 'curry_category', 'base_dish', 'curry_dish', 'subzi_dish', 'extra_dish'] as const;
export type LinkTarget = (typeof LINK_TARGETS)[number];
export type LinkValue = number | string;
export type LinkSlot = `${'with' | 'never'}:${LinkTarget}`;
/** `any` is no rule; `with` limits the dish to the chosen categories; `never` keeps it away from them. */
export type LinkMode = 'any' | 'with' | 'never';
/** How firmly a link holds: always is a hard rule; usually and sometimes are preferences the planner may give up. */
export type LinkStrength = 'always' | 'usually' | 'sometimes';
export const LINK_STRENGTHS: LinkStrength[] = ['always', 'usually', 'sometimes'];
/** The soft cost each non-hard strength writes (see `LEVELS`: strongly, slightly). */
const STRENGTH_COST = { usually: 10, sometimes: 3 } as const;
export interface Link { mode: LinkMode; values: LinkValue[]; strength: LinkStrength }

const strengthParams = (strength: LinkStrength) =>
  strength === 'always' ? { strength: 'must' as const } : { strength: 'prefer' as const, cost: STRENGTH_COST[strength] };

/** The strength a rule's params stand for; a soft cost of 8 or more reads as usually. */
export const strengthOf = (params: { strength?: string; cost?: number }): LinkStrength =>
  params.strength !== 'prefer' ? 'always' : (params.cost ?? 10) >= 8 ? 'usually' : 'sometimes';
export type Links = Record<LinkTarget, Link>;
/** A link as a form hands it over: strength left out means always. */
export type LinkEdit = Omit<Link, 'strength'> & { strength?: LinkStrength };

const LINK_FIELD = {
  base_category: 'base_category_id', extra_category: 'extra_category_id', curry_category: 'curry_category',
  base_dish: 'id', curry_dish: 'id', subzi_dish: 'id', extra_dish: 'id',
} as const;
const LINK_DISH_TYPE = {
  base_category: 'base', extra_category: 'extra', curry_category: 'curry',
  base_dish: 'base', curry_dish: 'curry', subzi_dish: 'subzi', extra_dish: 'extra',
} as const;
export const LINK_LABEL: Record<LinkTarget, string> = {
  base_category: 'base categories', extra_category: 'extra categories', curry_category: 'curry types',
  base_dish: 'specific bases', curry_dish: 'specific curries', subzi_dish: 'specific subzis', extra_dish: 'specific extras',
};
/** Targets that name individual dishes (by id) rather than a category. */
export const isDishTarget = (t: LinkTarget): t is 'base_dish' | 'curry_dish' | 'subzi_dish' | 'extra_dish' => LINK_FIELD[t] === 'id';
/** The kind of dish a dish target lists. */
export const dishTypeOf = (t: LinkTarget): ComponentType => LINK_DISH_TYPE[t];

const PLAIN_SLOTS = ['allowed_days', 'allowed_meals', 'exclude'] as const;
export const LINK_SLOTS: LinkSlot[] = LINK_TARGETS.flatMap((t) => [`with:${t}` as const, `never:${t}` as const]);
export const OWNED_SLOTS = [...PLAIN_SLOTS, ...LINK_SLOTS] as const;
export type OwnedSlot = (typeof OWNED_SLOTS)[number];
export const OWNED_TEMPLATES = OWNED_SLOTS;
export type OwnedTemplate = OwnedSlot;

/** For each owned rule type: a builder that makes or updates the rule once the dish has an id, or null to remove it. */
export type OwnedRuleChanges = Partial<Record<OwnedTemplate, ((c: { id: number; name: string }) => OwnedRule) | null>>;

const NAME_SUFFIX: Partial<Record<string, string>> = {
  'with:base_category': 'base pairing',
  'with:extra_category': 'only with these extras',
  'with:curry_category': 'only with these curry types',
  'never:base_category': 'not with these bases',
  'never:extra_category': 'not with these extras',
  'never:curry_category': 'not with these curries',
  allowed_days: 'only on certain days',
  allowed_meals: 'only at certain meals',
  exclude: 'never planned automatically',
};

/** Name of a rule owned by `componentName`, kept in step when the component is renamed. `slot` is an owned slot or a template id. */
export const ownedRuleName = (slot: string, componentName: string): string =>
  `${componentName}: ${NAME_SUFFIX[slot] ?? 'rule'}`;

export function pairingRule(component: { id: number; name: string }, baseCategories: readonly number[], strength: LinkStrength = 'always'): OwnedRule {
  return {
    name: ownedRuleName('with:base_category', component.name),
    spec: { template: 'pairs_with', params: { match: is('id', component.id), baseCategories: [...baseCategories], ...strengthParams(strength) } },
    owner_component_id: component.id,
  };
}

/** Base categories a pairing rule allows, or undefined when the rule is not a pairing. */
export function pairingCategories(rule: Pick<RuleRecord, 'spec'>): number[] | undefined {
  return rule.spec.template === 'pairs_with' ? [...(rule.spec.params.baseCategories ?? [])] : undefined;
}

/**
 * The base categories a curry or subzi goes with, given its pairing rule (if any) and every base category id.
 * No rule means any base. The result is what the base-category side ticks.
 */
export function pairedCategories(rule: Pick<RuleRecord, 'spec'> | undefined, allCategoryIds: readonly number[]): number[] {
  const own = rule ? pairingCategories(rule) : undefined;
  return own && own.length > 0 ? own.filter((id) => allCategoryIds.includes(id)) : [...allCategoryIds];
}

/** A link rule: the dish goes only with (or never with) the given categories of another kind of dish. */
export function linkRule(component: { id: number; name: string }, mode: 'with' | 'never', target: LinkTarget, values: readonly LinkValue[], strength: LinkStrength = 'always'): OwnedRule {
  if (mode === 'with' && target === 'base_category') return pairingRule(component, values as number[], strength);
  // A dish is never kept away from itself, so "only with" lists it too (it is dropped again on reading).
  const listed = mode === 'with' && isDishTarget(target) ? [...new Set([...values, component.id])] : [...values];
  const set = oneOf(LINK_FIELD[target], listed as never);
  const of = all(is('componentType', LINK_DISH_TYPE[target]), mode === 'never' ? set : not(set));
  return {
    name: ownedRuleName(`${mode}:${target}`, component.name),
    spec: { template: 'avoid_with', params: { match: is('id', component.id), with: of, ...strengthParams(strength) } },
    owner_component_id: component.id,
  };
}

/** The link a rule makes, or undefined when the rule is not a link. */
export function readLink(rule: Pick<RuleRecord, 'spec'>): (Link & { mode: 'with' | 'never'; target: LinkTarget }) | undefined {
  if (rule.spec.template === 'pairs_with') return { mode: 'with', target: 'base_category', values: [...(rule.spec.params.baseCategories ?? [])], strength: strengthOf(rule.spec.params) };
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
  return { mode: negated ? 'with' : 'never', target, values, strength: strengthOf(rule.spec.params) };
}

/** Which owned slot a rule fills, or undefined when it is not one a dish form edits. */
export function ownedSlot(rule: Pick<RuleRecord, 'spec'>): OwnedSlot | undefined {
  const t = rule.spec.template;
  if (t === 'pairs_with' || t === 'avoid_with') {
    const link = readLink(rule);
    return link && (`${link.mode}:${link.target}` as LinkSlot);
  }
  return (PLAIN_SLOTS as readonly string[]).includes(t) ? (t as OwnedSlot) : undefined;
}

/** Existing migrations: the curry types an extra never goes with. */
export const curryClashRule = (component: { id: number; name: string }, curryCategories: readonly CurryCategory[]): OwnedRule =>
  linkRule(component, 'never', 'curry_category', curryCategories);

/** Curry types a clash rule keeps away, or undefined when the rule is not a curry clash. */
export function clashCurryCategories(rule: Pick<RuleRecord, 'spec'>): CurryCategory[] | undefined {
  const link = readLink(rule);
  return link?.mode === 'never' && link.target === 'curry_category' ? (link.values as CurryCategory[]) : undefined;
}

export function dayRule(component: { id: number; name: string }, days: readonly Day[]): OwnedRule {
  return {
    name: ownedRuleName('allowed_days', component.name),
    spec: { template: 'allowed_days', params: { match: is('id', component.id), days: [...days], strength: 'must' } },
    owner_component_id: component.id,
  };
}

/** Days a specific-days rule allows, or undefined when the rule is not one. */
export function ruleDays(rule: Pick<RuleRecord, 'spec'>): Day[] | undefined {
  return rule.spec.template === 'allowed_days' ? [...rule.spec.params.days] : undefined;
}

export function mealRule(component: { id: number; name: string }, meals: readonly Meal[]): OwnedRule {
  return {
    name: ownedRuleName('allowed_meals', component.name),
    spec: { template: 'allowed_meals', params: { match: is('id', component.id), meals: [...meals], strength: 'must' } },
    owner_component_id: component.id,
  };
}

/** Meals an allowed-meals rule permits, or undefined when the rule is not one. */
export function ruleMeals(rule: Pick<RuleRecord, 'spec'>): Meal[] | undefined {
  return rule.spec.template === 'allowed_meals' ? [...rule.spec.params.meals] : undefined;
}

/** The dish is never planned automatically; it can still be picked by hand, as an override. */
export function exclusionRule(component: { id: number; name: string }): OwnedRule {
  return {
    name: ownedRuleName('exclude', component.name),
    spec: { template: 'exclude', params: { match: is('id', component.id), strength: 'must' } },
    owner_component_id: component.id,
  };
}

// ─── What a dish form edits ───────────────────────────────────────────────────

/** The settings a dish owns, as a form edits them. Empty means "no rule": any base, any curry and any day. */
export interface OwnedValues {
  links: Links;
  days: Day[];
  /** Empty means any meal. */
  meals: Meal[];
  neverAuto: boolean;
}

export const noLinks = (): Links =>
  Object.fromEntries(LINK_TARGETS.map((t) => [t, { mode: 'any', values: [], strength: 'always' }])) as unknown as Links;

/** Read a dish's settings from the rules it owns. A goes-with link wins over a never-with one for the same target. */
export function readOwned(rules: readonly Pick<RuleRecord, 'spec'>[]): OwnedValues {
  const first = <T>(read: (r: Pick<RuleRecord, 'spec'>) => T | undefined): T | undefined =>
    rules.map(read).find((v) => v !== undefined);
  const links = noLinks();
  const found = rules.map(readLink).filter((l) => l !== undefined);
  for (const target of LINK_TARGETS) {
    const link = found.find((l) => l.target === target && l.mode === 'with') ?? found.find((l) => l.target === target);
    if (link) links[target] = { mode: link.mode, values: link.values, strength: link.strength };
  }
  return {
    links,
    days: first(ruleDays) ?? [],
    meals: first(ruleMeals) ?? [],
    neverAuto: rules.some((r) => r.spec.template === 'exclude'),
  };
}

/** Whether a dish of this type is offered links to this target: not to its own kind where a meal holds only one. */
export const offersLink = (componentType: ComponentType, target: LinkTarget): boolean => {
  if (componentType === 'base' && (target === 'base_category' || target === 'base_dish')) return false;
  // A meal has one curry and one subzi, so those never need keeping apart from another of their own kind.
  return !((componentType === 'curry' && target === 'curry_dish') || (componentType === 'subzi' && target === 'subzi_dish'));
};

/**
 * The rule changes that make a dish's stored rules match `values`; only types that suit the dish are offered.
 * `links` is left out (or a target missing from it) when the dish's links are not being edited, so stored ones stay.
 */
export function ownedChanges(componentType: ComponentType, values: Omit<OwnedValues, 'links'> & { links?: Partial<Record<LinkTarget, LinkEdit>> }): OwnedRuleChanges {
  const { links, days, meals, neverAuto } = values;
  const changes: OwnedRuleChanges = {
    allowed_days: days.length ? (c) => dayRule(c, days) : null,
    exclude: neverAuto ? (c) => exclusionRule(c) : null,
  };
  // Any dish may own a meals rule, but only bases are offered the setting. For the others a stored one is left
  // alone. Allowing every meal is the same as no rule.
  if (componentType === 'base') changes.allowed_meals = meals.length > 0 && meals.length < MEALS.length ? (c) => mealRule(c, meals) : null;
  for (const target of LINK_TARGETS) {
    const link = links?.[target];
    if (!link || !offersLink(componentType, target)) continue;
    for (const mode of ['with', 'never'] as const) {
      const on = link.mode === mode && link.values.length > 0;
      changes[`${mode}:${target}`] = on ? (c) => linkRule(c, mode, target, link.values, link.strength ?? 'always') : null;
    }
  }
  return changes;
}

// ─── Days ─────────────────────────────────────────────────────────────────────

const WEEKDAYS: Day[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const WEEKEND: Day[] = ['saturday', 'sunday'];

export type DayMode = 'any' | 'weekdays' | 'weekends' | 'specific';

const sameDays = (a: readonly Day[], b: readonly Day[]) => a.length === b.length && a.every((d) => b.includes(d));

export function dayModeOf(days: readonly Day[]): DayMode {
  if (days.length === 0) return 'any';
  if (sameDays(days, WEEKDAYS)) return 'weekdays';
  if (sameDays(days, WEEKEND)) return 'weekends';
  return 'specific';
}

export function daysOfMode(mode: DayMode, specific: readonly Day[]): Day[] {
  return { any: [], weekdays: WEEKDAYS, weekends: WEEKEND, specific: [...specific] }[mode];
}

/** Badge text for a dish's days: "Weekdays", "Weekends", "Only Mon, Fri", or undefined for any day. */
export function describeDays(days: readonly Day[]): string | undefined {
  const mode = dayModeOf(days);
  if (mode === 'any') return undefined;
  if (mode === 'weekdays') return 'Weekdays';
  if (mode === 'weekends') return 'Weekends';
  const short = DAYS.filter((d) => days.includes(d)).map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3));
  return `Only ${short.join(', ')}`;
}

// ─── Meals ────────────────────────────────────────────────────────────────────

/** Badge text for a dish's meals: "Only breakfast, dinner", or undefined for any meal. */
export function describeMeals(meals: readonly Meal[]): string | undefined {
  if (meals.length === 0 || meals.length === MEALS.length) return undefined;
  return `Only ${MEALS.filter((m) => meals.includes(m)).join(', ')}`;
}
