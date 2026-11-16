// Stored rules and their compilation into planner constraints.
import type { Bounds, Constraint, RuleLevel } from '@/planner';
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

/** Ids that currently exist, so rules pointing at deleted components or categories are caught. */
export interface KnownIds {
  components: ReadonlySet<number>;
  baseCategories: ReadonlySet<number>;
  extraCategories: ReadonlySet<number>;
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

/** Names of references that no longer exist, e.g. ["component #12", "extra category #3"]. */
export function missingReferences(spec: RuleSpec, known: KnownIds): string[] {
  const refs = specReferences(spec);
  return [
    ...refs.components.filter((id) => !known.components.has(id)).map((id) => `component #${id}`),
    ...refs.baseCategories.filter((id) => !known.baseCategories.has(id)).map((id) => `base category #${id}`),
    ...refs.extraCategories.filter((id) => !known.extraCategories.has(id)).map((id) => `extra category #${id}`),
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
  const levels = compileSpec(parsed.spec).flatMap((b) => bodyLevels(rule, b)).map((p) => p.level);
  if (levels.includes(undefined)) return 'bring';
  return levels.reduce<RuleLevel | undefined>((best, l) => (best === undefined || STRENGTH[l!] > STRENGTH[best] ? l : best), undefined);
}

/**
 * Compile enabled rules. Rules that are invalid or reference something that no longer exists
 * are skipped and reported, so the planner never runs a rule whose meaning has changed.
 */
export function compileRules(rules: readonly RuleRecord[], known: KnownIds): { constraints: Constraint[]; issues: RuleIssue[] } {
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
    const owner = rule.owner_component_id !== undefined ? { owner: rule.owner_component_id } : {};
    compileSpec(parsed.spec).forEach((spec, i) => {
      for (const { body, level, suffix } of bodyLevels(rule, spec)) {
        // Pairs are what the others give way to, so they carry no level and no owner.
        const marks = level === undefined ? {} : { ...owner, level };
        constraints.push({ ...body, ...marks, id: `rule:${rule.id}:${i}${suffix}`, label: rule.name, origin: 'rule', ruleId: rule.id } as Constraint);
      }
    });
  }
  return { constraints, issues };
}
