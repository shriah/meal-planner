// Stored rules and their compilation into planner constraints.
import { cappedPart, isLeaf, matcherFields, type Bounds, type Constraint, type CountConstraint, type Matcher, type RuleLevel } from '@/planner';
import { constraintOverParts, type RuleParts } from './legacy-parts';
import { compileSpec, RuleSpecSchema, specReferences, type ConstraintBody, type RuleSpec, type RuleSpecInput } from './templates';

/** A rule as stored. `spec` is validated on read; anything invalid is reported, never applied. */
export interface RuleRecord {
  id: number;
  name: string;
  enabled: boolean;
  spec: RuleSpecInput;
  created_at: string;
  /** Set on the rules every library starts with, so they stay recognisable after a rename and can be restored. */
  default_key?: string;
  /** Component whose form manages this rule (a curry's base pairing). Such rules are edited there. */
  owner_component_id?: number;
}

/** Ids that currently exist, so rules pointing at deleted components, categories or parts are caught. */
export interface KnownIds {
  components: ReadonlySet<number>;
  categories: ReadonlySet<number>;
  parts: ReadonlySet<number>;
  /** The part each category belongs to; when given, a link naming a category of another part is caught. */
  categoryPart?: ReadonlyMap<number, number>;
}

export interface RuleIssue {
  ruleId: number;
  name: string;
  message: string;
}

export function parseSpec(spec: unknown): { ok: true; spec: RuleSpec } | { ok: false; message: string } {
  const parsed = RuleSpecSchema.safeParse(spec);
  if (parsed.success) return { ok: true, spec: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, message: `${issue.path.join('.') || 'rule'}: ${issue.message}` };
}

/** Names of references that no longer exist, e.g. ["component #12", "category #3", "part #5"]. */
export function missingReferences(spec: RuleSpec, known: KnownIds): string[] {
  const refs = specReferences(spec);
  return [
    ...refs.components.filter((id) => !known.components.has(id)).map((id) => `component #${id}`),
    ...refs.parts.filter((id) => !known.parts.has(id)).map((id) => `part #${id}`),
    ...refs.categories.filter((id) => !known.categories.has(id)).map((id) => `category #${id}`),
  ];
}

/** The level a rule's bodies sit on unless a template says `frequency`. */
export function levelOf(rule: RuleRecord): RuleLevel {
  if (rule.owner_component_id !== undefined) return 'dish';
  if (rule.default_key === 'sides-only-when-asked' || rule.default_key === 'variety' || rule.default_key === 'spacing') return 'frequency';
  if (rule.default_key !== undefined) return 'dish';
  return 'rule';
}

/** The bounds of `bounds` named in `keys` that are set. */
function pickBounds(bounds: Bounds, keys: readonly (keyof Bounds)[]): Bounds {
  return Object.fromEntries(keys.filter((k) => bounds[k] !== undefined).map((k) => [k, bounds[k]]));
}

/** One compiled piece of a rule body: the body as compiled, its level (none for a pair) and the id suffix. */
export interface BodyPart {
  body: ConstraintBody;
  level?: RuleLevel;
  suffix: string;
}

/**
 * The compiled pieces of one body of `rule`. A pair carries no level. A frequency count with a minimum splits:
 * a brought dish still counts toward the minimum (level `rule`), only the maximum gives way (`frequency`, id
 * suffix `:max`). Shared by `compileRules` and `ruleLevel`, so what the Rules page shows is what compiles.
 */
export function bodyLevels(rule: RuleRecord, body: ConstraintBody): BodyPart[] {
  if (body.kind === 'pair') return [{ body, suffix: '' }];
  if (body.level !== 'frequency') return [{ body, level: levelOf(rule), suffix: '' }];
  if (body.kind === 'count' && (body.bounds.hardMin !== undefined || body.bounds.softMin !== undefined)) {
    return [
      { body: { ...body, bounds: pickBounds(body.bounds, ['hardMin', 'softMin']) }, level: 'rule', suffix: '' },
      { body: { ...body, bounds: pickBounds(body.bounds, ['softMax', 'hardMax']) }, level: 'frequency', suffix: ':max' },
    ];
  }
  return [{ body, level: 'frequency', suffix: '' }];
}

const STRENGTH: Record<RuleLevel, number> = { rule: 0, dish: 1, frequency: 2 };

/**
 * What a rule gives way to, for display: `bring` when it brings a dish into the meal (a pair), otherwise the
 * strongest level of its compiled bodies (`frequency` over `dish` over `rule`).
 * Undefined for a rule that cannot be read.
 */
export function ruleLevel(rule: RuleRecord): RuleLevel | 'bring' | undefined {
  const parsed = parseSpec(rule.spec);
  if (!parsed.ok) return undefined;
  // A level does not depend on what the bodies match, so no parts are needed.
  const levels = compileSpec(parsed.spec).flatMap((b) => bodyLevels(rule, b)).map((p) => p.level);
  if (levels.includes(undefined)) return 'bring';
  return levels.reduce<RuleLevel | undefined>((best, l) => (best === undefined || STRENGTH[l!] > STRENGTH[best] ? l : best), undefined);
}

/** Whether a leave-out rule names the first part, which holds every meal's one main dish and is never left out. */
function leavesOutFirstPart(spec: RuleSpec, parts: RuleParts): boolean {
  return spec.template === 'skip_when' && parts.list.length > 0 && spec.params.skip.includes(parts.list[0].id);
}

/**
 * The parts the stored rules cap at one dish per meal, read as the planner reads them (`cappedPart`: an enabled hard
 * per-meal maximum of 1 over one part, unscoped). On the converted parts these are the Curry and Subzi caps.
 */
export function cappedParts(rules: readonly RuleRecord[], parts: RuleParts): Set<number> {
  const out = new Set<number>();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const parsed = parseSpec(rule.spec);
    if (!parsed.ok) continue;
    for (const body of compileSpec(parsed.spec, { firstPart: parts.list[0]?.id })) {
      if (body.kind !== 'count') continue;
      const c = (parts.legacy ? constraintOverParts(body as Constraint, parts.legacy) : body) as CountConstraint;
      const part = cappedPart(c);
      if (part !== undefined) out.add(part);
    }
  }
  return out;
}

/** Whether a comes link waits for the first part, which every meal holds, so the wait means nothing. */
function waitsForFirstPart(spec: RuleSpec, parts: RuleParts): boolean {
  return spec.template === 'comes_with' && spec.params.when !== undefined && parts.list.length > 0 && String(parts.list[0].id) in spec.params.when;
}

/** The categories a link-shaped matcher (`all(part, category set)`, the set maybe negated) names outside its part. */
function outsidePart(m: Matcher, categoryPart: ReadonlyMap<number, number>): { part: number; ids: number[] } | undefined {
  if (!('all' in m) || m.all.length !== 2) return undefined;
  const [part, set] = m.all;
  const leaf = 'not' in set ? set.not : set;
  if (!isLeaf(part) || part.field !== 'part' || part.op !== 'eq' || !isLeaf(leaf) || leaf.field !== 'category') return undefined;
  const ids = ([leaf.value].flat() as number[]).filter((id) => categoryPart.has(id) && categoryPart.get(id) !== part.value);
  return ids.length ? { part: part.value as number, ids } : undefined;
}

/** Categories a link names that belong to another part than the one it points at: a pairing's must be the first part's. */
export function misplacedCategories(spec: RuleSpec, categoryPart: ReadonlyMap<number, number>, firstPart: number | undefined): { part: number; ids: number[] } | undefined {
  switch (spec.template) {
    case 'pairs_with': {
      if (firstPart === undefined) return undefined;
      const ids = spec.params.categories.filter((id) => categoryPart.has(id) && categoryPart.get(id) !== firstPart);
      return ids.length ? { part: firstPart, ids } : undefined;
    }
    case 'comes_with': return outsidePart(spec.params.of, categoryPart);
    case 'avoid_with': return outsidePart(spec.params.with, categoryPart);
    case 'require_with': return outsidePart(spec.params.when, categoryPart);
    default: return undefined;
  }
}

/** Fields a stored rule may name but the planner cannot match on once rules are about parts. */
const UNPLANNED_FIELDS = ['role', 'slot_part'] as const;

/** Fields that only mean something through a dish's type: with no type-to-part ids to read them against, they match nothing. */
const TYPE_FIELDS = ['role', 'componentType', 'base_category_id', 'extra_category_id', 'curry_category'] as const;

const constraintFields = (c: Constraint): Set<string> => {
  const matchers = c.kind === 'pair' ? [c.when, c.of, ...(c.inMeal ?? [])] : c.kind === 'count' && c.when ? [c.select, c.when.exists] : [c.select];
  return new Set(matchers.flatMap((m) => [...matcherFields(m)]));
};

/**
 * Compile enabled rules. Rules that are invalid or reference something that no longer exists
 * are skipped and reported, so the planner never runs a rule whose meaning has changed. Constraints are about
 * parts: every rule, a default too, is planned as stored, and component-type matchers left in older rules are
 * rewritten to parts (the stored rows are not changed). The defaults name the parts they were built over; editing
 * the parts (Stage 4) is what rewrites them.
 */
export function compileRules(rules: readonly RuleRecord[], known: KnownIds, parts: RuleParts): { constraints: Constraint[]; issues: RuleIssue[] } {
  const constraints: Constraint[] = [];
  const issues: RuleIssue[] = [];
  // The scorer settles conflicts between pairs by constraint order, so compile in rule-id order.
  for (const rule of [...rules].sort((a, b) => a.id - b.id)) {
    if (!rule.enabled) continue;
    const parsed = parseSpec(rule.spec);
    if (!parsed.ok) {
      issues.push({ ruleId: rule.id, name: rule.name, message: `invalid rule — ${parsed.message}` });
      continue;
    }
    const missing = missingReferences(parsed.spec, known);
    if (missing.length) {
      issues.push({ ruleId: rule.id, name: rule.name, message: `refers to ${missing.join(', ')}, which no longer exists` });
      continue;
    }
    if (leavesOutFirstPart(parsed.spec, parts)) {
      issues.push({ ruleId: rule.id, name: rule.name, message: `leaves out ${parts.list[0].name}, which every meal holds` });
      continue;
    }
    if (waitsForFirstPart(parsed.spec, parts)) {
      issues.push({ ruleId: rule.id, name: rule.name, message: `waits for ${parts.list[0].name}, which every meal holds` });
      continue;
    }
    const misplaced = known.categoryPart && misplacedCategories(parsed.spec, known.categoryPart, parts.list[0]?.id);
    if (misplaced) {
      const part = parts.list.find((p) => p.id === misplaced.part)?.name ?? `part #${misplaced.part}`;
      const cats = misplaced.ids.map((id) => `category #${id}`).join(', ');
      issues.push({ ruleId: rule.id, name: rule.name, message: `refers to ${cats}, which ${misplaced.ids.length > 1 ? 'are not categories' : 'is not a category'} of ${part}` });
      continue;
    }
    const owner = rule.owner_component_id !== undefined ? { owner: rule.owner_component_id } : {};
    const compiledRule: Constraint[] = [];
    compileSpec(parsed.spec, { firstPart: parts.list[0]?.id }).forEach((spec, i) => {
      for (const { body, level, suffix } of bodyLevels(rule, spec)) {
        // Pairs are what the others give way to, so they carry no level and no owner.
        const marks = level === undefined ? {} : { ...owner, level };
        const compiled = { ...body, ...marks, id: `rule:${rule.id}:${i}${suffix}`, label: rule.name, origin: 'rule', ruleId: rule.id } as Constraint;
        compiledRule.push(parts.legacy ? constraintOverParts(compiled, parts.legacy) : compiled);
      }
    });
    // The rewrite turns role and componentType into parts; a field it leaves behind cannot be planned.
    // With no legacy ids to rewrite by, every field named after a dish's type is left behind too.
    const unplannedFields: readonly string[] = parts.legacy ? UNPLANNED_FIELDS : [...UNPLANNED_FIELDS, ...TYPE_FIELDS];
    const unplanned = unplannedFields.find((f) => compiledRule.some((c) => (constraintFields(c) as Set<string>).has(f)));
    if (unplanned) {
      issues.push({ ruleId: rule.id, name: rule.name, message: `names the field "${unplanned}", which the planner does not use; name the part with "part"` });
      continue;
    }
    constraints.push(...compiledRule);
  }
  return { constraints, issues };
}
