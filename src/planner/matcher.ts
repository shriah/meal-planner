// Typed predicate AST over assignments (component + role + day + meal).
// Serialisable, Zod-validated, compiled to plain closures (no eval).
import { z } from 'zod';
import {
  COMPONENT_TYPES, DIETARY_TAGS, FREQUENCIES, OCCASION_TAGS, PROTEIN_TAGS, REGIONAL_TAGS,
  type ComponentType, type DietaryTag, type Frequency, type OccasionTag, type ProteinTag, type RegionalTag,
} from '@/types/component';
import { DAYS, MEALS, ROLES, type Assignment, type Day, type Meal, type Role } from './types';

export type FieldKind = 'enum' | 'id' | 'set' | 'idset' | 'bool';

/** Value type of every field (element type for set fields). */
export interface FieldValues {
  role: Role;
  day: Day;
  meal: Meal;
  componentType: ComponentType;
  id: number;
  base_category_id: number;
  extra_category_id: number;
  compatible_base_category_ids: number;
  /** True when the component declares a compatible-base list (curries). */
  compat_restricted: boolean;
  dietary_tags: DietaryTag;
  protein_tag: ProteinTag;
  regional_tags: RegionalTag;
  occasion_tags: OccasionTag;
  frequency: Frequency;
}
export type FieldKey = keyof FieldValues;

interface FieldDef<K extends FieldKind = FieldKind> {
  kind: K;
  label: string;
  options?: readonly string[];
  read: (a: Assignment) => unknown;
}

// `satisfies` keeps each field's kind as a literal so leaf types can be derived from it.
export const FIELDS = {
  role: { kind: 'enum', label: 'Role', options: ROLES, read: (a) => a.role },
  day: { kind: 'enum', label: 'Day', options: DAYS, read: (a) => a.day },
  meal: { kind: 'enum', label: 'Meal', options: MEALS, read: (a) => a.meal },
  componentType: { kind: 'enum', label: 'Component type', options: COMPONENT_TYPES, read: (a) => a.c.componentType },
  id: { kind: 'id', label: 'Component', read: (a) => a.c.id },
  base_category_id: { kind: 'id', label: 'Base category', read: (a) => a.c.base_category_id ?? undefined },
  extra_category_id: { kind: 'id', label: 'Extra category', read: (a) => a.c.extra_category_id ?? undefined },
  compatible_base_category_ids: { kind: 'idset', label: 'Compatible base categories', read: (a) => a.c.compatible_base_category_ids },
  compat_restricted: { kind: 'bool', label: 'Has compatibility list', read: (a) => a.c.compatible_base_category_ids !== undefined },
  dietary_tags: { kind: 'set', label: 'Dietary', options: DIETARY_TAGS, read: (a) => a.c.dietary_tags },
  protein_tag: { kind: 'enum', label: 'Protein', options: PROTEIN_TAGS, read: (a) => a.c.protein_tag },
  regional_tags: { kind: 'set', label: 'Region', options: REGIONAL_TAGS, read: (a) => a.c.regional_tags },
  occasion_tags: { kind: 'set', label: 'Occasion', options: OCCASION_TAGS, read: (a) => a.c.occasion_tags },
  frequency: { kind: 'enum', label: 'Frequency', options: FREQUENCIES, read: (a) => a.c.frequency ?? 'normal' },
} as const satisfies Record<FieldKey, FieldDef>;
export const FIELD_KEYS = Object.keys(FIELDS) as FieldKey[];

type KindOf<F extends FieldKey> = (typeof FIELDS)[F]['kind'];

type TypedLeafFor<F extends FieldKey> =
  KindOf<F> extends 'set' | 'idset'
    ? | { field: F; op: 'has'; value: FieldValues[F] }
      | { field: F; op: 'hasAny' | 'hasAll'; value: FieldValues[F][] }
    : KindOf<F> extends 'bool'
      ? { field: F; op: 'eq'; value: boolean }
      : | { field: F; op: 'eq' | 'neq'; value: FieldValues[F] }
        | { field: F; op: 'in'; value: FieldValues[F][] };

export type Leaf = { [F in FieldKey]: TypedLeafFor<F> }[FieldKey];
export type Matcher = Leaf | { all: Matcher[] } | { any: Matcher[] } | { not: Matcher };

export const OPS_BY_KIND: Record<FieldKind, readonly Leaf['op'][]> = {
  enum: ['eq', 'neq', 'in'],
  id: ['eq', 'neq', 'in'],
  bool: ['eq'],
  set: ['has', 'hasAny', 'hasAll'],
  idset: ['has', 'hasAny', 'hasAll'],
};
const MANY_OPS: readonly string[] = ['in', 'hasAny', 'hasAll'];

function valueSchema(key: FieldKey): z.ZodType<unknown> {
  const f: FieldDef = FIELDS[key];
  if (f.kind === 'id' || f.kind === 'idset') return z.number().int();
  if (f.kind === 'bool') return z.boolean();
  return z.enum(f.options as [string, ...string[]]);
}
const VALUE_SCHEMAS = Object.fromEntries(FIELD_KEYS.map((k) => [k, valueSchema(k)])) as Record<FieldKey, z.ZodType<unknown>>;

const LeafSchema = z
  .object({
    field: z.enum(FIELD_KEYS as [FieldKey, ...FieldKey[]]),
    op: z.enum(['eq', 'neq', 'in', 'has', 'hasAny', 'hasAll']),
    value: z.unknown(),
  })
  .strict()
  .superRefine((leaf, ctx) => {
    if (!OPS_BY_KIND[FIELDS[leaf.field].kind].includes(leaf.op)) {
      ctx.addIssue({ code: 'custom', path: ['op'], message: `operator "${leaf.op}" is not valid for field "${leaf.field}"` });
      return;
    }
    const vs = VALUE_SCHEMAS[leaf.field];
    const ok = MANY_OPS.includes(leaf.op)
      ? Array.isArray(leaf.value) && leaf.value.every((v) => vs.safeParse(v).success)
      : vs.safeParse(leaf.value).success;
    if (!ok) ctx.addIssue({ code: 'custom', path: ['value'], message: `invalid value for "${leaf.field}" ${leaf.op}` });
  }) as unknown as z.ZodType<Leaf>;

export const MatcherSchema: z.ZodType<Matcher> = z.lazy(() =>
  z.union([
    LeafSchema,
    z.object({ all: z.array(MatcherSchema) }).strict(),
    z.object({ any: z.array(MatcherSchema) }).strict(),
    z.object({ not: MatcherSchema }).strict(),
  ]),
) as z.ZodType<Matcher>;

// ─── Builders ─────────────────────────────────────────────────────────────────

export const all = (...ms: Matcher[]): Matcher => ({ all: ms });
export const any = (...ms: Matcher[]): Matcher => ({ any: ms });
export const not = (m: Matcher): Matcher => ({ not: m });
/** Matches every assignment (`all` of nothing). */
export const TRUE: Matcher = { all: [] };

const isSetKind = (field: FieldKey) => {
  const k = FIELDS[field].kind;
  return k === 'set' || k === 'idset';
};
/** `is('role', 'curry')`, `is('dietary_tags', 'non-veg')`: eq for scalars, has for sets. */
export const is = <F extends FieldKey>(field: F, value: FieldValues[F]): Matcher =>
  ({ field, op: isSetKind(field) ? 'has' : 'eq', value }) as unknown as Leaf;
/** In-list for scalars, has-any for sets. */
export const oneOf = <F extends FieldKey>(field: F, value: FieldValues[F][]): Matcher =>
  ({ field, op: isSetKind(field) ? 'hasAny' : 'in', value }) as unknown as Leaf;

export const isLeaf = (m: Matcher): m is Leaf => 'field' in m;

/** Fields referenced anywhere in the matcher. */
export function matcherFields(m: Matcher, out = new Set<FieldKey>()): Set<FieldKey> {
  if (isLeaf(m)) out.add(m.field);
  else if ('all' in m) m.all.forEach((x) => matcherFields(x, out));
  else if ('any' in m) m.any.forEach((x) => matcherFields(x, out));
  else matcherFields(m.not, out);
  return out;
}

// ─── Compilation to closures ──────────────────────────────────────────────────

export type MatchFn = (a: Assignment) => boolean;

/**
 * A missing scalar (e.g. no protein_tag) never equals a value and is never in a list,
 * so `neq` is true for it. A missing set behaves as empty.
 */
function compileLeaf(l: Leaf): MatchFn {
  const read = FIELDS[l.field].read;
  const value = l.value as unknown;
  switch (l.op) {
    case 'eq': return (a) => read(a) === value;
    case 'neq': return (a) => read(a) !== value;
    case 'in': {
      const s = new Set(value as unknown[]);
      return (a) => s.has(read(a));
    }
    case 'has': return (a) => ((read(a) as readonly unknown[] | undefined) ?? []).includes(value);
    case 'hasAny': {
      const vs = value as unknown[];
      return (a) => {
        const arr = (read(a) as readonly unknown[] | undefined) ?? [];
        return vs.some((v) => arr.includes(v));
      };
    }
    case 'hasAll': {
      const vs = value as unknown[];
      return (a) => {
        const arr = (read(a) as readonly unknown[] | undefined) ?? [];
        return vs.every((v) => arr.includes(v));
      };
    }
  }
}

/** `all([])` is true, `any([])` is false. */
export function compileMatcher(m: Matcher): MatchFn {
  if (isLeaf(m)) return compileLeaf(m);
  if ('all' in m) {
    const fs = m.all.map(compileMatcher);
    return (a) => fs.every((f) => f(a));
  }
  if ('any' in m) {
    const fs = m.any.map(compileMatcher);
    return (a) => fs.some((f) => f(a));
  }
  const f = compileMatcher(m.not);
  return (a) => !f(a);
}
