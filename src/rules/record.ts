// Stored rules and their compilation into planner constraints.
import type { Bounds, Constraint, Level } from '@/planner';
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
export function levelOf(rule: RuleRecord): Level {
  if (rule.owner_component_id !== undefined) return 'dish';
  if (rule.default_key === 'sides-only-when-asked' || rule.default_key === 'variety' || rule.default_key === 'spacing') return 'frequency';
  if (rule.default_key !== undefined) return 'dish';
  return 'rule';
}

/** The bounds of `bounds` named in `keys` that are set. */
function pickBounds(bounds: Bounds, keys: readonly (keyof Bounds)[]): Bounds {
  return Object.fromEntries(keys.filter((k) => bounds[k] !== undefined).map((k) => [k, bounds[k]]));
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
    const asked = { ...owner, level: 'frequency' as const };
    const push = (body: ConstraintBody, marks: object, id: string) =>
      constraints.push({ ...body, ...marks, id, label: rule.name, origin: 'rule', ruleId: rule.id } as Constraint);
    compileSpec(parsed.spec).forEach((body, i) => {
      const id = `rule:${rule.id}:${i}`;
      // Pairs are what the others give way to, so they carry no level and no owner.
      if (body.kind === 'pair') push(body, {}, id);
      else if (body.level !== 'frequency') push(body, { ...owner, level: levelOf(rule) }, id);
      else if (body.kind === 'count' && (body.bounds.hardMin !== undefined || body.bounds.softMin !== undefined)) {
        // A brought dish still counts toward a minimum; only the maximum gives way.
        push({ ...body, bounds: pickBounds(body.bounds, ['hardMin', 'softMin']) }, { ...owner, level: 'rule' }, id);
        push({ ...body, bounds: pickBounds(body.bounds, ['softMax', 'hardMax']) }, asked, `${id}:max`);
      } else push(body, asked, id);
    });
  }
  return { constraints, issues };
}
