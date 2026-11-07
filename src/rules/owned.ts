// Rules a component owns: edited on the component's form, stored as ordinary rules, at most one per
// slot. Any dish may own "goes with" / "never with" links to the categories of another kind (base
// categories, extra categories, curry types): a goes-with link to base categories is a `pairs_with` rule,
// every other link an `avoid_with` rule. A curry, subzi or extra may also be "served with" bases: when one
// of them is the meal's base, the dish is added too (a `require_with` rule). A dish also owns the days it may be planned on (`allowed_days`),
// the meals (`allowed_meals`) and whether it is planned automatically at all (`exclude`).
import { STRENGTH_COST } from './levels';
import { all, DAYS, MEALS, is, isLeaf, not, oneOf, type Day, type Matcher, type Meal } from '@/planner';
import type { ComponentType, CurryCategory } from '@/types/component';
import type { RuleRecord } from './record';

export type OwnedRule = Omit<RuleRecord, 'id' | 'enabled' | 'created_at'> & { owner_component_id: number };

// ─── Links: goes with / never with ────────────────────────────────────────────

/** What a link points at: the categories of another kind of dish. */
export const LINK_TARGETS = ['base_category', 'extra_category', 'curry_category', 'base_dish', 'curry_dish', 'subzi_dish', 'extra_dish'] as const;
export type LinkTarget = (typeof LINK_TARGETS)[number];
export type LinkValue = number | string;
/** Bases a dish can be served with: whole base categories or specific bases. */
export const SERVE_TARGETS = ['base_category', 'base_dish'] as const;
export type ServeTarget = (typeof SERVE_TARGETS)[number];
export type LinkMode = 'with' | 'never' | 'serve';
export type LinkSlot = `${'with' | 'never'}:${LinkTarget}` | `serve:${ServeTarget}`;
/** How firmly a link holds: always is a hard rule; the others are preferences the planner may give up. */
export type LinkStrength = 'always' | 'usually' | 'moderately' | 'sometimes';
export const LINK_STRENGTHS: LinkStrength[] = ['always', 'usually', 'moderately', 'sometimes'];
/** The days and meals a link holds on; left out, it holds everywhere. */
export interface LinkScope { days?: Day[]; meals?: Meal[] }
/** `with` limits the dish to the chosen values; `never` keeps it away from them; `serve` adds it to meals
 * whose base is one of them. */
export interface DishLink { mode: LinkMode; target: LinkTarget; values: LinkValue[]; strength: LinkStrength; scope?: LinkScope }
/** A link as a caller hands it over: strength left out means always. */
type LinkInput = Omit<DishLink, 'strength'> & { strength?: LinkStrength };

const strengthParams = (strength: LinkStrength) =>
  strength === 'always' ? { strength: 'must' as const } : { strength: 'prefer' as const, cost: STRENGTH_COST[strength] };

/** The strength a rule's params stand for. Hand-edited costs fall in bands: 8 or more usually, 5 to 7 moderately. */
export const strengthOf = (params: { strength?: string; cost?: number }): LinkStrength => {
  if (params.strength !== 'prefer') return 'always';
  const cost = params.cost ?? 10;
  return cost >= 8 ? 'usually' : cost >= 5 ? 'moderately' : 'sometimes';
};

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
export const LINK_LABEL: Record<LinkTarget, string> = {
  base_category: 'base categories', extra_category: 'extra categories', curry_category: 'curry types',
  base_dish: 'specific bases', curry_dish: 'specific curries', subzi_dish: 'specific subzis', extra_dish: 'specific extras',
};
/** Targets that name individual dishes (by id) rather than a category. */
export const isDishTarget = (t: LinkTarget): t is 'base_dish' | 'curry_dish' | 'subzi_dish' | 'extra_dish' => LINK_FIELD[t] === 'id';
/** The kind of dish a dish target lists. */
export const dishTypeOf = (t: LinkTarget): ComponentType => LINK_DISH_TYPE[t];

const PLAIN_SLOTS = ['allowed_days', 'allowed_meals', 'exclude'] as const;
export const LINK_SLOTS: LinkSlot[] = [
  ...LINK_TARGETS.flatMap((t) => [`with:${t}` as const, `never:${t}` as const]),
  ...SERVE_TARGETS.map((t) => `serve:${t}` as const),
];
/** Whether an owned slot holds a link (rather than days, meals or "never auto-pick"). */
export const isLinkSlot = (slot: string): slot is LinkSlot => (LINK_SLOTS as readonly string[]).includes(slot);
export const isServeTarget = (t: LinkTarget): t is ServeTarget => (SERVE_TARGETS as readonly string[]).includes(t);
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
  'serve:base_category': 'served with these bases',
  'serve:base_dish': 'served with these bases',
  allowed_days: 'only on certain days',
  allowed_meals: 'only at certain meals',
  exclude: 'never planned automatically',
};

/** Name of a rule owned by `componentName`, kept in step when the component is renamed. `slot` is an owned slot or a template id. */
export const ownedRuleName = (slot: string, componentName: string): string =>
  `${componentName}: ${NAME_SUFFIX[slot] ?? 'rule'}`;

export function pairingRule(component: { id: number; name: string }, baseCategories: readonly number[], strength: LinkStrength = 'always', scope?: LinkScope): OwnedRule {
  return {
    name: ownedRuleName('with:base_category', component.name),
    spec: { template: 'pairs_with', params: { match: is('id', component.id), baseCategories: [...baseCategories], ...scopeParams(scope), ...strengthParams(strength) } },
    owner_component_id: component.id,
  };
}

/** Base categories a pairing rule allows, or undefined when the rule is not a pairing. */
export function pairingCategories(rule: Pick<RuleRecord, 'spec'>): number[] | undefined {
  return rule.spec.template === 'pairs_with' ? [...(rule.spec.params.baseCategories ?? [])] : undefined;
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
export function readLink(rule: Pick<RuleRecord, 'spec'>): DishLink | undefined {
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

/** The owned slot a link fills. */
export const linkSlotOf = (link: Pick<DishLink, 'mode' | 'target'>): LinkSlot => `${link.mode}:${link.target}` as LinkSlot;

/** Which owned slot a rule fills, or undefined when it is not one a dish form edits. */
export function ownedSlot(rule: Pick<RuleRecord, 'spec'>): OwnedSlot | undefined {
  const t = rule.spec.template;
  if (t === 'pairs_with' || t === 'avoid_with' || t === 'require_with') {
    const link = readLink(rule);
    return link && linkSlotOf(link);
  }
  return (PLAIN_SLOTS as readonly string[]).includes(t) ? (t as OwnedSlot) : undefined;
}

/** Existing migrations: the curry types an extra never goes with. */
export const curryClashRule = (component: { id: number; name: string }, curryCategories: readonly CurryCategory[]): OwnedRule =>
  linkRule(component, { mode: 'never', target: 'curry_category', values: [...curryCategories] });

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
  /** At most one per slot, in `LINK_SLOTS` order. */
  links: DishLink[];
  days: Day[];
  /** Empty means any meal. */
  meals: Meal[];
  neverAuto: boolean;
}

/** Read a dish's settings from the rules it owns. */
export function readOwned(rules: readonly Pick<RuleRecord, 'spec'>[]): OwnedValues {
  const first = <T>(read: (r: Pick<RuleRecord, 'spec'>) => T | undefined): T | undefined =>
    rules.map(read).find((v) => v !== undefined);
  const found = rules.map(readLink).filter((l) => l !== undefined);
  const links = LINK_SLOTS.flatMap((slot) => found.find((l) => linkSlotOf(l) === slot) ?? []);
  return {
    links,
    days: first(ruleDays) ?? [],
    meals: first(ruleMeals) ?? [],
    neverAuto: rules.some((r) => r.spec.template === 'exclude'),
  };
}

/** Whether a dish of this type can be served with bases: every dish but a base. */
export const offersServe = (componentType: ComponentType): boolean => componentType !== 'base';

/** Whether a dish of this type is offered links to this target: not to its own kind where a meal holds only one. */
export const offersLink = (componentType: ComponentType, target: LinkTarget): boolean => {
  if (componentType === 'base' && (target === 'base_category' || target === 'base_dish')) return false;
  // A meal has one curry and one subzi, so those never need keeping apart from another of their own kind.
  return !((componentType === 'curry' && target === 'curry_dish') || (componentType === 'subzi' && target === 'subzi_dish'));
};

/**
 * The link slots "Add link" may create for a dish: served with bases first, then only with / never with
 * every offered target, specific dishes included. Slots the dish already fills are left out.
 */
export const addableSlots = (componentType: ComponentType, links: DishLink[]): LinkSlot[] => {
  const taken = links.map(linkSlotOf);
  const out: LinkSlot[] = [];
  for (const target of LINK_TARGETS) {
    if (isServeTarget(target) && offersServe(componentType)) out.push(linkSlotOf({ mode: 'serve', target }));
    if (!offersLink(componentType, target)) continue;
    out.push(linkSlotOf({ mode: 'with', target }), linkSlotOf({ mode: 'never', target }));
  }
  return out.filter((slot) => !taken.includes(slot));
};

/**
 * The rule changes that make a dish's stored rules match `values`; only types that suit the dish are offered.
 * With `links` given, every offered link slot is set from the list or removed. Left out, stored links stay.
 */
export function ownedChanges(componentType: ComponentType, values: Omit<OwnedValues, 'links'> & { links?: readonly LinkInput[] }): OwnedRuleChanges {
  const { links, days, meals, neverAuto } = values;
  const changes: OwnedRuleChanges = {
    allowed_days: days.length ? (c) => dayRule(c, days) : null,
    exclude: neverAuto ? (c) => exclusionRule(c) : null,
  };
  // Any dish may own a meals rule, but only bases are offered the setting. For the others a stored one is left
  // alone. Allowing every meal is the same as no rule.
  if (componentType === 'base') changes.allowed_meals = meals.length > 0 && meals.length < MEALS.length ? (c) => mealRule(c, meals) : null;
  if (!links) return changes;
  for (const target of LINK_TARGETS) {
    if (!offersLink(componentType, target)) continue;
    for (const mode of ['with', 'never'] as const) {
      const link = links.find((l) => l.mode === mode && l.target === target && l.values.length > 0);
      changes[`${mode}:${target}`] = link ? (c) => linkRule(c, link) : null;
    }
  }
  if (offersServe(componentType)) {
    for (const target of SERVE_TARGETS) {
      const link = links.find((l) => l.mode === 'serve' && l.target === target && l.values.length > 0);
      changes[`serve:${target}`] = link ? (c) => linkRule(c, link) : null;
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
