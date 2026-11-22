// Human-readable text for matchers and scopes, used in rule descriptions and the editor.
import { FIELDS, isLeaf, type Day, type Matcher, type Meal } from '@/planner';
import { fromMatcher, type Condition } from './conditions';

export interface Names {
  component?: (id: number) => string | undefined;
  baseCategory?: (id: number) => string | undefined;
  extraCategory?: (id: number) => string | undefined;
  /** A part's name as stored ("Curry"); descriptions lower-case it. */
  part?: (id: number) => string | undefined;
  category?: (id: number) => string | undefined;
  /** Whether a category names a type of dish, read before the noun ("lentil curries"), as the curry types do. */
  categoryIsType?: (id: number) => boolean;
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (xs: string[], word = 'or') => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${word} ${xs[xs.length - 1]}`);

const PLURAL: Record<string, string> = { base: 'bases', curry: 'curries', subzi: 'subzis', extra: 'extras' };

/** A name as a lower-case plural noun: "Curry" reads "curries", "Extras" stays "extras". */
export function pluralNoun(name: string): string {
  const word = name.toLowerCase();
  if (word.endsWith('s')) return word;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/** The parts as plural nouns ("curries", "extras"); a part it cannot find reads "part #n". */
export const partNames = (ids: readonly unknown[], names: Names): string[] =>
  ids.map((id) => {
    const name = names.part?.(id as number);
    return name === undefined ? `part #${id}` : pluralNoun(name);
  });

function valueText(field: string, value: unknown, names: Names): string {
  const id = value as number;
  if (field === 'id') return names.component?.(id) ?? `component #${id}`;
  if (field === 'base_category_id') return names.baseCategory?.(id) ?? `base category #${id}`;
  if (field === 'extra_category_id') return names.extraCategory?.(id) ?? `extra category #${id}`;
  if (field === 'category') return names.category?.(id) ?? `category #${id}`;
  if (field === 'part') return names.part?.(id) ?? `part #${id}`;
  return String(value);
}

const values = (c: Condition, names: Names) => c.values.map((v) => valueText(c.field, v, names));

/** Words before the noun ("non-veg south-indian"), qualifiers after it ("with fish"). */
function words(c: Condition, names: Names): { adjective?: string; qualifier?: string } {
  const v = list(values(c, names));
  switch (c.field) {
    case 'category':
      // A category naming a type of dish reads like one ("lentil curries"); any other like a base category.
      if (c.values.length === 0 || !c.values.every((id) => names.categoryIsType?.(id as number))) {
        return { qualifier: `${c.negate ? 'outside' : 'in'} the ${v} ${c.values.length > 1 ? 'categories' : 'category'}` };
      }
      return c.negate ? { qualifier: `that are not ${v}` } : { adjective: v };
    case 'dietary_tags':
    case 'regional_tags':
    case 'curry_category':
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
    case 'part':
      return { qualifier: `except ${list(partNames(c.values, names))}` };
    case 'id':
      return { qualifier: `other than ${list(values(c, names), 'and')}` };
  }
}

/** Describe conditions that must all hold, as one noun phrase. */
function phrase(conditions: Condition[], names: Names): string {
  const type = conditions.find((c) => (c.field === 'componentType' || c.field === 'part') && !c.negate);
  const named = conditions.find((c) => c.field === 'id' && !c.negate);
  const rest = conditions.filter((c) => c !== type && c !== named);
  const typeNouns = (t: Condition) => (t.field === 'part' ? partNames(t.values, names) : t.values.map((v) => PLURAL[String(v)] ?? String(v)));
  const noun = named ? list(values(named, names)) : type ? list(typeNouns(type)) : 'dishes';
  const adjectives: string[] = [];
  const qualifiers: string[] = [];
  for (const c of rest) {
    const p = words(c, names);
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

/** The condition of a conditional link: "the curry is Sambar or Rasam and the subzi is Beans Poriyal". */
export function describeWhen(when: { curry?: number[]; subzi?: number[] }, name: (id: number) => string): string {
  return (['curry', 'subzi'] as const)
    .filter((part) => when[part])
    .map((part) => `the ${part} is ${list(when[part]!.map(name))}`)
    .join(' and ');
}
