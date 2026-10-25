// A flat, form-friendly view of matchers: conditions joined by "all" or "any", each
// "field is / is not one of values". Converts to and from planner matchers; matchers with
// deeper nesting are reported as not representable rather than altered.
import { all, any, FIELDS, isLeaf, not, oneOf, is, TRUE, type FieldKey, type Leaf, type Matcher } from '@/planner';

/** Fields offered in the rule editor. Day and meal are chosen through a rule's scope instead. */
export const CONDITION_FIELDS = [
  'componentType', 'id', 'base_category_id', 'extra_category_id',
  'dietary_tags', 'protein_tag', 'regional_tags', 'occasion_tags', 'frequency',
] as const satisfies readonly FieldKey[];
export type ConditionField = (typeof CONDITION_FIELDS)[number];

export type ConditionValue = string | number;

export interface Condition {
  field: ConditionField;
  /** "is not" instead of "is". */
  negate: boolean;
  /** Matches when the field has any of these values. */
  values: ConditionValue[];
}

export interface ConditionGroup {
  join: 'all' | 'any';
  conditions: Condition[];
}

export const emptyGroup = (): ConditionGroup => ({ join: 'all', conditions: [] });

const isConditionField = (f: FieldKey): f is ConditionField => (CONDITION_FIELDS as readonly string[]).includes(f);

function conditionToMatcher(c: Condition): Matcher {
  const field = c.field as FieldKey;
  const m = c.values.length === 1
    ? is(field, c.values[0] as never)
    : oneOf(field, c.values as never[]);
  return c.negate ? not(m) : m;
}

/** An empty group matches every component. */
export function toMatcher(group: ConditionGroup): Matcher {
  if (group.conditions.length === 0) return TRUE;
  if (group.conditions.length === 1) return conditionToMatcher(group.conditions[0]);
  const parts = group.conditions.map(conditionToMatcher);
  return group.join === 'all' ? all(...parts) : any(...parts);
}

function leafToCondition(l: Leaf, negate: boolean): Condition | null {
  if (!isConditionField(l.field)) return null;
  const kind = FIELDS[l.field].kind;
  const values = Array.isArray(l.value) ? (l.value as ConditionValue[]) : [l.value as ConditionValue];
  switch (l.op) {
    case 'eq':
    case 'has':
      return { field: l.field, negate, values };
    case 'in':
    case 'hasAny':
      // An empty list is kept as a condition without values, which validation then rejects.
      return { field: l.field, negate, values };
    case 'neq':
      return negate ? null : { field: l.field, negate: true, values };
    case 'hasAll':
      // "includes all of" only fits the flat model for a single value.
      return kind === 'set' && values.length === 1 ? { field: l.field, negate, values } : null;
  }
}

function toCondition(m: Matcher): Condition | null {
  if (isLeaf(m)) return leafToCondition(m, false);
  if ('not' in m && isLeaf(m.not)) return leafToCondition(m.not, true);
  return null;
}

/** The flat form of a matcher, or null when it needs nesting the editor cannot show. */
export function fromMatcher(m: Matcher): ConditionGroup | null {
  if ('all' in m || 'any' in m) {
    const items = 'all' in m ? m.all : m.any;
    const conditions = items.map(toCondition);
    if (conditions.some((c) => c === null)) return null;
    // any([]) matches nothing, which no editor state means.
    if ('any' in m && items.length === 0) return null;
    return { join: 'all' in m ? 'all' : 'any', conditions: conditions as Condition[] };
  }
  const c = toCondition(m);
  return c ? { join: 'all', conditions: [c] } : null;
}

/** Problems that stop a group from being saved, e.g. a condition with no values chosen. */
export function groupProblems(group: ConditionGroup): string[] {
  return group.conditions.flatMap((c, i) => (c.values.length === 0 ? [`condition ${i + 1}: choose at least one value`] : []));
}
