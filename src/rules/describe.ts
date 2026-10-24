// Human-readable text for matchers and scopes, used in rule descriptions.
import { FIELDS, isLeaf, type Day, type Matcher, type Meal } from '@/planner';

export interface Names {
  component?: (id: number) => string | undefined;
  baseCategory?: (id: number) => string | undefined;
  extraCategory?: (id: number) => string | undefined;
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function valueText(field: string, value: unknown, names: Names): string {
  const id = value as number;
  if (field === 'id') return names.component?.(id) ?? `component #${id}`;
  if (field === 'base_category_id' || field === 'compatible_base_category_ids') return names.baseCategory?.(id) ?? `base category #${id}`;
  if (field === 'extra_category_id') return names.extraCategory?.(id) ?? `extra category #${id}`;
  return String(value);
}

/** "protein is fish and region is south-indian", "Sambar", "not (dietary is non-veg)". */
export function describeMatcher(m: Matcher, names: Names = {}): string {
  if (isLeaf(m)) {
    const values = (Array.isArray(m.value) ? m.value : [m.value]).map((v) => valueText(m.field, v, names));
    const joined = values.join(m.op === 'hasAll' ? ' and ' : ' or ');
    if (m.field === 'id') return m.op === 'neq' ? `anything but ${joined}` : joined;
    const label = FIELDS[m.field].label.toLowerCase();
    if (m.op === 'neq') return `${label} is not ${joined}`;
    return `${label} ${m.op === 'hasAll' ? 'includes' : 'is'} ${joined}`;
  }
  if ('all' in m) return m.all.length === 0 ? 'anything' : m.all.map((x) => part(x, names)).join(' and ');
  if ('any' in m) return m.any.length === 0 ? 'nothing' : m.any.map((x) => part(x, names)).join(' or ');
  return `not (${describeMatcher(m.not, names)})`;
}

const part = (m: Matcher, names: Names) => (isLeaf(m) || 'not' in m ? describeMatcher(m, names) : `(${describeMatcher(m, names)})`);

/** " on Friday or Saturday at lunch", or "" when unrestricted. */
export function describeScope(scope: { days?: readonly Day[]; meals?: readonly Meal[] } | undefined): string {
  const parts: string[] = [];
  if (scope?.days?.length) parts.push(`on ${scope.days.map(titleCase).join(' or ')}`);
  if (scope?.meals?.length) parts.push(`at ${scope.meals.join(' or ')}`);
  return parts.length ? ` ${parts.join(' ')}` : '';
}
