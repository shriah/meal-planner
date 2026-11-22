// Rules a component owns: edited on the component's form, stored as ordinary rules. Days, meals and
// "never auto-pick" are at most one rule each (matched by slot); links are matched by rule id, and a dish
// may hold several links of the same kind. A link points at the dishes or categories of one part, and is modelled
// top to bottom: a higher dish decides and a lower one follows. A link to a lower part is a "comes with" link (a
// `comes_with` rule: the dish brings one of them); a link to a higher part is a "served with" link (a `require_with`
// rule: the dish is added when one of them is in the meal). "Only with" the categories of the first part is a pairing
// (`pairs_with`); every other "only with" or "never with" link is an `avoid_with` rule. A dish also owns the days it may
// be planned on (`allowed_days`), the meals (`allowed_meals`) and whether it is planned automatically at all (`exclude`).
import { STRENGTH_COST } from './levels';
import { all, DAYS, MEALS, is, isLeaf, not, oneOf, type Day, type Matcher, type Meal } from '@/planner';
import type { ComponentType } from '@/types/component';
import { pluralNoun, singularNoun, whenParts } from './describe';
import type { RuleRecord } from './record';

export type OwnedRule = Omit<RuleRecord, 'id' | 'enabled' | 'created_at'> & { owner_component_id: number };

// ─── Links ────────────────────────────────────────────────────────────────────

/** Whether a link names dishes (by id) or categories (by id) of its part. */
export type LinkKind = 'dish' | 'category';
/** What a link points at: the dishes or the categories of one part. */
export interface LinkTarget { part: number; kind: LinkKind }
/** A dish id or a category id, as the target's kind says. */
export type LinkValue = number;
export type LinkMode = 'with' | 'never' | 'serve' | 'comes';
export type LinkSlot = `${LinkMode}:${number}:${LinkKind}`;
/** How firmly a link holds: always is a hard rule; the others are preferences the planner may give up. */
export type LinkStrength = 'always' | 'usually' | 'moderately' | 'sometimes';
export const LINK_STRENGTHS: LinkStrength[] = ['always', 'usually', 'moderately', 'sometimes'];
/** The days and meals a link holds on; left out, it holds everywhere. */
export interface LinkScope { days?: Day[]; meals?: Meal[] }
/** The dishes a comes link waits for, keyed by part id: every part named must hold one of its dishes. */
export type LinkWhen = Record<number, number[]>;
/** The parts links are made over, in meal order. */
export type LinkParts = readonly { id: number; name: string }[];
/** `with` limits the dish to the chosen values; `never` keeps it away from them; `serve` adds it to meals that hold
 * one of them (a higher part); `comes` brings one of them (a lower part) along with it. */
export interface DishLink {
  mode: LinkMode; target: LinkTarget; values: LinkValue[]; strength: LinkStrength; scope?: LinkScope
  /** `comes` only: the dishes the meal must hold, by part (any one dish of a part will do), for the dish to come. */
  when?: LinkWhen
  /** The stored rule this link was read from; absent on a link not yet saved. */
  ruleId?: number
}
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

const FIELD = { dish: 'id', category: 'category' } as const;
const kindOfField = (field: string): LinkKind | undefined => (field === 'id' ? 'dish' : field === 'category' ? 'category' : undefined);
/** Whether a target names individual dishes (by id) rather than categories. */
export const isDishTarget = (t: LinkTarget): boolean => t.kind === 'dish';
export const sameTarget = (a: LinkTarget, b: LinkTarget): boolean => a.part === b.part && a.kind === b.kind;
const position = (parts: LinkParts, id: number) => parts.findIndex((p) => p.id === id);

/** What "comes with" stores from a dish of `ownerPart` to `targetPart`: a lower part is brought (comes), a higher one brings the dish (serve). */
export function bringMode(ownerPart: number, targetPart: number, parts: LinkParts): 'comes' | 'serve' {
  return position(parts, targetPart) > position(parts, ownerPart) ? 'comes' : 'serve';
}

/** Whether a dish of `ownerPart` may hold a link of this mode to `target`: "never with" to any part, the others to any part but its own. */
export function offersLink(ownerPart: number, target: LinkTarget, parts: LinkParts, mode: LinkMode = 'never'): boolean {
  if (position(parts, target.part) < 0) return false;
  return mode === 'never' || target.part !== ownerPart;
}

/**
 * The modes the link editor offers from a dish of `ownerPart` to `target`, in button order: to the first part, the
 * bring mode (served with), only with and never with; to any other part the bring mode (comes with, or served with
 * above) and never with, as a link to a lower part brings its dish rather than limiting; to its own part never with.
 */
export function linkModes(ownerPart: number, target: LinkTarget, parts: LinkParts): LinkMode[] {
  const bring = bringMode(ownerPart, target.part, parts);
  const modes: LinkMode[] = target.part === parts[0]?.id ? [bring, 'with', 'never'] : [bring, 'never'];
  return modes.filter((m) => offersLink(ownerPart, target, parts, m));
}

/** Every target a link may name: each part's categories (where `hasCategories` says it has any), then each part's dishes. */
export function linkTargets(parts: LinkParts, hasCategories: (part: number) => boolean): LinkTarget[] {
  return [
    ...parts.filter((p) => hasCategories(p.id)).map((p): LinkTarget => ({ part: p.id, kind: 'category' })),
    ...parts.map((p): LinkTarget => ({ part: p.id, kind: 'dish' })),
  ];
}

const PLAIN_SLOTS = ['allowed_days', 'allowed_meals', 'exclude'] as const;
type PlainSlot = (typeof PLAIN_SLOTS)[number];
export type OwnedSlot = PlainSlot | LinkSlot;
export type OwnedTemplate = OwnedSlot;
/** Whether an owned slot holds a link (rather than days, meals or "never auto-pick"). */
export const isLinkSlot = (slot: string): slot is LinkSlot => /^(with|never|serve|comes):\d+:(dish|category)$/.test(slot);

/**
 * For days, meals and never-auto (one rule each): a builder that makes or updates the rule once the dish has an id,
 * or null to remove it. Links are changed by rule id instead (`LinkChange`).
 */
export type OwnedRuleChanges = Partial<Record<PlainSlot, ((c: { id: number; name: string }) => OwnedRule) | null>>;
export const PLAIN_OWNED_SLOTS: readonly PlainSlot[] = PLAIN_SLOTS;

/** One change to a dish's stored links: a new rule, a stored rule rewritten, or a stored rule removed. */
export type LinkChange =
  | { kind: 'add'; link: DishLink }
  | { kind: 'update'; ruleId: number; link: DishLink }
  | { kind: 'remove'; ruleId: number };

const NAME_SUFFIX: Record<PlainSlot, string> = {
  allowed_days: 'only on certain days',
  allowed_meals: 'only at certain meals',
  exclude: 'never planned automatically',
};

/** Name of a rule owned by `componentName`, kept in step when the component is renamed. `slot` is a plain owned slot or a template id. */
export const ownedRuleName = (slot: string, componentName: string): string =>
  `${componentName}: ${NAME_SUFFIX[slot as PlainSlot] ?? 'rule'}`;

/** What a link's rule is called after its dish's name: "base pairing", "served with these bases", "comes with". */
function linkSuffix(link: Pick<DishLink, 'mode' | 'target'>, parts: LinkParts): string {
  const part = parts.find((p) => p.id === link.target.part);
  const plural = part ? pluralNoun(part.name) : `part #${link.target.part} dishes`;
  switch (link.mode) {
    case 'comes': return 'comes with';
    case 'serve': return `served with these ${plural}`;
    case 'with':
      if (link.target.kind === 'dish') return 'rule';
      return link.target.part === parts[0]?.id && part ? `${singularNoun(part.name)} pairing` : `only with these ${plural}`;
    case 'never': return link.target.kind === 'dish' ? 'rule' : `not with these ${plural}`;
  }
}

/** The name of a link rule owned by `componentName`. */
export const linkRuleName = (link: Pick<DishLink, 'mode' | 'target'>, parts: LinkParts, componentName: string): string =>
  `${componentName}: ${linkSuffix(link, parts)}`;

/** The name an owned rule takes when its dish is called `componentName`. */
export function ownedRuleNameOf(rule: Pick<RuleRecord, 'spec'>, parts: LinkParts, componentName: string): string {
  const link = readLink(rule, parts);
  return link ? linkRuleName(link, parts, componentName) : ownedRuleName(ownedSlot(rule, parts) ?? rule.spec.template, componentName);
}

/** "Only with" the given categories of the first part. */
export function pairingRule(component: { id: number; name: string }, categories: readonly number[], parts: LinkParts, strength: LinkStrength = 'always', scope?: LinkScope): OwnedRule {
  const target: LinkTarget = { part: parts[0].id, kind: 'category' };
  return {
    name: linkRuleName({ mode: 'with', target }, parts, component.name),
    spec: { template: 'pairs_with', params: { match: is('id', component.id), categories: [...categories], ...scopeParams(scope), ...strengthParams(strength) } },
    owner_component_id: component.id,
  };
}

/** First-part categories a pairing rule allows, or undefined when the rule is not a pairing. */
export function pairingCategories(rule: Pick<RuleRecord, 'spec'>): number[] | undefined {
  return rule.spec.template === 'pairs_with' ? [...(rule.spec.params.categories ?? [])] : undefined;
}

/** The stored form of a condition: empty parts dropped, and nothing when nothing is left. */
export function cleanWhen(when: Readonly<Record<number, readonly number[]>> | undefined): LinkWhen | undefined {
  const parts = whenParts(when);
  return parts.length ? Object.fromEntries(parts) : undefined;
}

/**
 * The rule a link makes for the dish `self`, over `parts` (in meal order). A comes link that waits for the part it
 * brings into, or for the first part, is refused. Which way a link points is not checked here: `bringMode` is how the
 * editor chooses, and `compileRules` names a link pointing the wrong way.
 */
export function linkRule(self: { id: number; name: string; part_id?: number }, link: LinkInput, parts: LinkParts): OwnedRule {
  const { mode, target, values, strength = 'always', scope } = link;
  const name = linkRuleName(link, parts, self.name);
  const set = oneOf(FIELD[target.kind], [...values]);
  const inPart = (m: Matcher) => all(is('part', target.part), m);
  if (mode === 'serve') {
    return {
      name,
      spec: { template: 'require_with', params: { when: inPart(set), components: [self.id], categories: [], ...scopeParams(scope), ...strengthParams(strength) } },
      owner_component_id: self.id,
    };
  }
  if (mode === 'comes') {
    const when = cleanWhen(link.when);
    if (when && (target.part in when || (parts.length > 0 && parts[0].id in when))) {
      throw new Error('a link cannot wait for the part it brings into, or for the first part');
    }
    return {
      name,
      spec: { template: 'comes_with', params: { match: is('id', self.id), of: inPart(set), ...(when && { when }), ...scopeParams(scope), ...strengthParams(strength) } },
      owner_component_id: self.id,
    };
  }
  if (mode === 'with' && target.kind === 'category' && target.part === parts[0]?.id) return pairingRule(self, values, parts, strength, scope);
  // A dish is never kept away from itself, so "only with" lists it too (it is dropped again on reading).
  const listed = mode === 'with' && target.kind === 'dish' ? [...new Set([...values, self.id])] : [...values];
  const listedSet = oneOf(FIELD[target.kind], listed);
  return {
    name,
    spec: { template: 'avoid_with', params: { match: is('id', self.id), with: inPart(mode === 'never' ? listedSet : not(listedSet)), ...scopeParams(scope), ...strengthParams(strength) } },
    owner_component_id: self.id,
  };
}

/** A link's matcher read back: `all(part, set)` gives the target and its values. */
function readTarget(m: Matcher): { target: LinkTarget; set: Matcher } | undefined {
  if (!('all' in m) || m.all.length !== 2) return undefined;
  const [part, set] = m.all;
  if (!isLeaf(part) || part.field !== 'part' || part.op !== 'eq') return undefined;
  const leaf = 'not' in set ? set.not : set;
  if (!isLeaf(leaf)) return undefined;
  const kind = kindOfField(leaf.field);
  return kind && { target: { part: part.value as number, kind }, set };
}
const leafValues = (m: Matcher): LinkValue[] => (isLeaf(m) ? ([m.value].flat() as LinkValue[]) : []);

/** The link a rule makes, or undefined when the rule is not a link. `parts` (in meal order) names the first part a pairing points at. */
export function readLink(rule: Pick<RuleRecord, 'spec'>, parts: LinkParts): DishLink | undefined {
  const scoped = (link: DishLink): DishLink => {
    const { scope } = scopeParams((rule.spec.params as { scope?: LinkScope }).scope);
    return scope ? { ...link, scope } : link;
  };
  const spec = rule.spec;
  if (spec.template === 'pairs_with') {
    if (parts.length === 0) return undefined;
    return scoped({ mode: 'with', target: { part: parts[0].id, kind: 'category' }, values: [...(spec.params.categories ?? [])], strength: strengthOf(spec.params) });
  }
  if (spec.template === 'require_with') {
    const p = spec.params;
    if ((p.components ?? []).length !== 1 || (p.categories ?? []).length > 0) return undefined;
    const read = readTarget(p.when as Matcher);
    if (!read || 'not' in read.set) return undefined;
    return scoped({ mode: 'serve', target: read.target, values: leafValues(read.set), strength: strengthOf(p) });
  }
  if (spec.template === 'comes_with') {
    const p = spec.params;
    const read = readTarget(p.of as Matcher);
    if (!read || 'not' in read.set) return undefined;
    const when = p.when && cleanWhen(Object.fromEntries(Object.entries(p.when).map(([k, v]) => [Number(k), v as number[]])));
    return scoped({ mode: 'comes', target: read.target, values: leafValues(read.set), strength: strengthOf(p), ...(when && { when }) });
  }
  if (spec.template !== 'avoid_with') return undefined;
  const read = readTarget(spec.params.with as Matcher);
  if (!read) return undefined;
  const negated = 'not' in read.set;
  let values = leafValues(negated ? (read.set as { not: Matcher }).not : read.set);
  if (negated && read.target.kind === 'dish') {
    const owner = spec.params.match as Matcher;
    if (isLeaf(owner) && owner.field === 'id') values = values.filter((v) => v !== owner.value);
  }
  return scoped({ mode: negated ? 'with' : 'never', target: read.target, values, strength: strengthOf(spec.params) });
}

/** The owned slot a link fills. */
export const linkSlotOf = (link: Pick<DishLink, 'mode' | 'target'>): LinkSlot => `${link.mode}:${link.target.part}:${link.target.kind}`;

/** Which owned slot a rule fills, or undefined when it is not one a dish form edits. */
export function ownedSlot(rule: Pick<RuleRecord, 'spec'>, parts: LinkParts): OwnedSlot | undefined {
  const t = rule.spec.template;
  if (t === 'pairs_with' || t === 'avoid_with' || t === 'require_with' || t === 'comes_with') {
    const link = readLink(rule, parts);
    return link && linkSlotOf(link);
  }
  return (PLAIN_SLOTS as readonly string[]).includes(t) ? (t as OwnedSlot) : undefined;
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
  /** Every link the dish owns, each with its rule id, in `LINK_SLOTS` order and then by rule id. */
  links: DishLink[];
  days: Day[];
  /** Empty means any meal. */
  meals: Meal[];
  neverAuto: boolean;
}

/**
 * Where a link sits in a dish's list: "only with" and "never with" first, then served with, then comes with; within
 * each, categories before dishes, in part order, and "only with" before "never with".
 */
function linkOrder(l: DishLink, parts: LinkParts): number[] {
  const group = l.mode === 'serve' ? 1 : l.mode === 'comes' ? 2 : 0;
  return [group, l.target.kind === 'category' ? 0 : 1, position(parts, l.target.part), l.mode === 'never' ? 1 : 0];
}

/** Read a dish's settings from the rules it owns. `parts` are the parts in meal order. */
export function readOwned(rules: readonly (Pick<RuleRecord, 'spec'> & { id?: number })[], parts: LinkParts): OwnedValues {
  const first = <T>(read: (r: Pick<RuleRecord, 'spec'>) => T | undefined): T | undefined =>
    rules.map(read).find((v) => v !== undefined);
  const found = rules.flatMap((r) => {
    const link = readLink(r, parts);
    if (!link) return [];
    return [r.id === undefined ? link : { ...link, ruleId: r.id }];
  });
  const compare = (a: DishLink, b: DishLink) => {
    const x = linkOrder(a, parts), y = linkOrder(b, parts);
    const i = x.findIndex((v, k) => v !== y[k]);
    return i >= 0 ? x[i] - y[i] : (a.ruleId ?? 0) - (b.ruleId ?? 0);
  };
  const links = found.sort(compare);
  return {
    links,
    days: first(ruleDays) ?? [],
    meals: first(ruleMeals) ?? [],
    neverAuto: rules.some((r) => r.spec.template === 'exclude'),
  };
}

/**
 * The link slots "Add link" may still fill for a dish of `ownerPart`, over `targets`: every mode `linkModes` offers. A
 * slot the dish already fills is left out, except a bring slot below the first part: a dish may bring, or be added
 * with, several dishes of one part.
 */
export const addableSlots = (ownerPart: number, links: readonly DishLink[], targets: readonly LinkTarget[], parts: LinkParts): LinkSlot[] => {
  const repeatable = (l: Pick<DishLink, 'mode' | 'target'>) => l.mode === 'comes' || (l.mode === 'serve' && l.target.part !== parts[0]?.id);
  const taken = links.filter((l) => !repeatable(l)).map(linkSlotOf);
  return targets
    .flatMap((target) => linkModes(ownerPart, target, parts).map((mode) => ({ mode, target })))
    .filter((l) => repeatable(l) || !taken.includes(linkSlotOf(l)))
    .map(linkSlotOf);
};

/**
 * The days, meals and never-auto changes that make a dish's stored rules match `values`; only types that suit the
 * dish are offered. Links are not touched here: see `linkChanges`.
 */
export function ownedChanges(componentType: ComponentType, values: Omit<OwnedValues, 'links'>): OwnedRuleChanges {
  const { days, meals, neverAuto } = values;
  const changes: OwnedRuleChanges = {
    allowed_days: days.length ? (c) => dayRule(c, days) : null,
    exclude: neverAuto ? (c) => exclusionRule(c) : null,
  };
  // Any dish may own a meals rule, but only bases are offered the setting. For the others a stored one is left
  // alone. Allowing every meal is the same as no rule.
  if (componentType === 'base') changes.allowed_meals = meals.length > 0 && meals.length < MEALS.length ? (c) => mealRule(c, meals) : null;
  return changes;
}

const sameSet = <T>(a: readonly T[] = [], b: readonly T[] = []) => a.length === b.length && a.every((v) => b.includes(v));

/** Same link in meaning: order of values, days and meals does not matter, an empty scope is no scope, and the rule id is ignored. */
export const sameLink = (a: DishLink | undefined, b: DishLink | undefined): boolean =>
  a === undefined || b === undefined ? a === b
    : a.mode === b.mode && sameTarget(a.target, b.target) && a.strength === b.strength && sameSet(a.values, b.values) &&
      sameSet(a.scope?.days, b.scope?.days) && sameSet(a.scope?.meals, b.scope?.meals) && sameWhen(a.when, b.when);

/** Same condition: every part either names holds the same dishes, an empty part counting as absent. */
const sameWhen = (a: LinkWhen | undefined, b: LinkWhen | undefined): boolean => {
  const x = whenParts(a), y = whenParts(b);
  return x.length === y.length && x.every(([part, ids], i) => y[i][0] === part && sameSet(ids, y[i][1]));
};

/**
 * The link changes that turn `base` (the links as stored when editing began) into `next`, matched by rule id.
 * A stored link left as it was gives nothing; one changed is updated; one gone is removed; a link without a rule
 * id is added. A link with no values counts as gone.
 */
export function linkChanges(base: readonly DishLink[], next: readonly DishLink[]): LinkChange[] {
  const kept = next.filter((l) => l.values.length > 0);
  const out: LinkChange[] = [];
  for (const link of kept) {
    if (link.ruleId === undefined) {
      out.push({ kind: 'add', link });
      continue;
    }
    const before = base.find((l) => l.ruleId === link.ruleId);
    if (!sameLink(before, link)) out.push({ kind: 'update', ruleId: link.ruleId, link });
  }
  for (const { ruleId } of base) {
    if (ruleId !== undefined && !kept.some((l) => l.ruleId === ruleId)) out.push({ kind: 'remove', ruleId });
  }
  return out;
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
