// Human-readable text for matchers and scopes, used in rule descriptions and the editor.
import { FIELDS, isLeaf, type Day, type Matcher, type Meal } from '@/planner';
import { fromMatcher, type Condition } from './conditions';

export interface Names {
  component?: (id: number) => string | undefined;
  baseCategory?: (id: number) => string | undefined;
  extraCategory?: (id: number) => string | undefined;
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (xs: string[], word = 'or') => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${word} ${xs[xs.length - 1]}`);

const PLURAL: Record<string, string> = { base: 'bases', curry: 'curries', subzi: 'subzis', extra: 'extras' };

function valueText(field: string, value: unknown, names: Names): string {
  const id = value as number;
  if (field === 'id') return names.component?.(id) ?? `component #${id}`;
  if (field === 'base_category_id' || field === 'compatible_base_category_ids') return names.baseCategory?.(id) ?? `base category #${id}`;
  if (field === 'extra_category_id') return names.extraCategory?.(id) ?? `extra category #${id}`;
  return String(value);
}

const values = (c: Condition, names: Names) => c.values.map((v) => valueText(c.field, v, names));

/** Words before the noun ("non-veg south-indian"), qualifiers after it ("with fish"). */
function parts(c: Condition, names: Names): { adjective?: string; qualifier?: string } {
  const v = list(values(c, names));
  switch (c.field) {
    case 'dietary_tags':
    case 'regional_tags':
      return c.negate ? { qualifier: `that are not ${v}` } : { adjective: v };
    case 'protein_tag':
      return { qualifier: `${c.negate ? 'without' : 'with'} ${v}` };
    case 'base_category_id':
    case 'extra_category_id':
      return { qualifier: `${c.negate ? 'outside' : 'in'} the ${v} ${c.values.length > 1 ? 'categories' : 'category'}` };
    case 'occasion_tags':
      return { qualifier: `${c.negate ? 'not tagged' : 'tagged'} ${v}` };
    case 'frequency':
      return { qualifier: `${c.negate ? 'not marked' : 'marked'} ${v}` };
    case 'componentType':
      return { qualifier: `except ${list(c.values.map((t) => PLURAL[String(t)] ?? String(t)))}` };
    case 'id':
      return { qualifier: `other than ${list(values(c, names), 'and')}` };
  }
}

/** Describe conditions that must all hold, as one noun phrase. */
function phrase(conditions: Condition[], names: Names): string {
  const type = conditions.find((c) => c.field === 'componentType' && !c.negate);
  const named = conditions.find((c) => c.field === 'id' && !c.negate);
  const rest = conditions.filter((c) => c !== type && c !== named);
  const noun = named
    ? list(values(named, names))
    : type ? list(type.values.map((t) => PLURAL[String(t)] ?? String(t))) : 'dishes';
  const adjectives: string[] = [];
  const qualifiers: string[] = [];
  for (const c of rest) {
    const p = parts(c, names);
    if (p.adjective) adjectives.push(p.adjective);
    if (p.qualifier) qualifiers.push(p.qualifier);
  }
  return [adjectives.join(' '), noun, qualifiers.join(' and ')].filter(Boolean).join(' ');
}

/** "non-veg curries with fish", "Poori", "bases in the Rice-based category", "any dish". */
export function describeMatcher(m: Matcher, names: Names = {}): string {
  const group = fromMatcher(m);
  if (group) {
    if (group.conditions.length === 0) return 'any dish';
    return group.join === 'all'
      ? phrase(group.conditions, names)
      : list(group.conditions.map((c) => phrase([c], names)));
  }
  return structural(m, names);
}

/** Literal fallback for matchers the flat model cannot express. */
function structural(m: Matcher, names: Names): string {
  if (isLeaf(m)) {
    const vs = (Array.isArray(m.value) ? m.value : [m.value]).map((v) => valueText(m.field, v, names));
    if (m.field === 'id') return m.op === 'neq' ? `anything but ${vs.join(' or ')}` : vs.join(' or ');
    const label = FIELDS[m.field].label.toLowerCase();
    if (m.op === 'neq') return `${label} is not ${vs.join(' or ')}`;
    return `${label} ${m.op === 'hasAll' ? 'includes' : 'is'} ${vs.join(m.op === 'hasAll' ? ' and ' : ' or ')}`;
  }
  if ('all' in m) return m.all.length === 0 ? 'any dish' : m.all.map((x) => wrap(x, names)).join(' and ');
  if ('any' in m) return m.any.length === 0 ? 'nothing' : m.any.map((x) => wrap(x, names)).join(' or ');
  return `not (${structural(m.not, names)})`;
}
const wrap = (m: Matcher, names: Names) => (isLeaf(m) || 'not' in m ? structural(m, names) : `(${structural(m, names)})`);

/** " on Friday or Saturday at lunch", or "" when unrestricted. */
export function describeScope(scope: { days?: readonly Day[]; meals?: readonly Meal[] } | undefined): string {
  const out: string[] = [];
  if (scope?.days?.length) out.push(`on ${list(scope.days.map(titleCase))}`);
  if (scope?.meals?.length) out.push(`at ${list([...scope.meals])}`);
  return out.length ? ` ${out.join(' ')}` : '';
}
