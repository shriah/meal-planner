// Form metadata for rule templates, draft validation, and match previews. Lets any UI render
// an editor for every template without template-specific code.
import { compileMatcher, TRUE, type ComponentLike, type Matcher } from '@/planner';
import { fromMatcher, groupProblems } from './conditions';
import { RuleSpecSchema, type RuleSpec, type RuleSpecInput, type TemplateId } from './templates';

export type FormFieldKind =
  | 'match'            // a condition group (Matcher)
  | 'scope'            // optional days and meals
  | 'roles'            // base / curry / subzi / extra
  | 'skip'             // curry / subzi / extra
  | 'meals'            // one or more meals
  | 'days'             // one or more days
  | 'count'            // a whole number
  | 'within'           // 'week' or a number of days
  | 'per'              // meal / day / week
  | 'direction'        // prefer / avoid
  | 'weight'           // 1–5
  | 'strength'         // must / prefer
  | 'cost'             // 1–10, for prefer rules
  | 'components'       // component ids
  | 'baseCategories'   // base category ids
  | 'extraCategories'; // extra category ids

export interface FormField {
  key: string;
  kind: FormFieldKind;
  label: string;
  help?: string;
  optional?: boolean;
}

type ParamsInput<T extends TemplateId> = Extract<RuleSpecInput, { template: T }>['params'];

export interface TemplateForm<T extends TemplateId> {
  fields: FormField[];
  defaults: () => ParamsInput<T>;
}

const strength: FormField = {
  key: 'strength', kind: 'strength', label: 'How strict',
  help: '“Must” rules always hold when possible; “prefer” rules give way when they conflict with others.',
};
const cost: FormField = {
  key: 'cost', kind: 'cost', label: 'How much it matters', optional: true,
  help: 'For “prefer” rules: 1 gives way easily, 10 (the default) almost never.',
};
const scope: FormField = { key: 'scope', kind: 'scope', label: 'When', help: 'Leave empty for every day and meal.', optional: true };

export const TEMPLATE_FORMS: { [T in TemplateId]: TemplateForm<T> } = {
  exclude: {
    fields: [{ key: 'match', kind: 'match', label: 'Never include' }, scope, strength, cost],
    defaults: () => ({ match: TRUE, strength: 'must' }),
  },
  only_allow: {
    fields: [
      { key: 'roles', kind: 'roles', label: 'For these parts of a meal' },
      { key: 'match', kind: 'match', label: 'Only allow' },
      scope, strength, cost,
    ],
    defaults: () => ({ match: TRUE, roles: ['curry'], strength: 'must' }),
  },
  require: {
    fields: [
      { key: 'match', kind: 'match', label: 'Always include' },
      { key: 'min', kind: 'count', label: 'How many in each meal' },
      scope, strength, cost,
    ],
    defaults: () => ({ match: TRUE, min: 1, strength: 'must' }),
  },
  limit: {
    fields: [
      { key: 'match', kind: 'match', label: 'Count' },
      { key: 'per', kind: 'per', label: 'Per' },
      { key: 'min', kind: 'count', label: 'At least', optional: true },
      { key: 'max', kind: 'count', label: 'At most', optional: true },
      scope, strength, cost,
    ],
    defaults: () => ({ match: TRUE, per: 'week', max: 2, strength: 'must' }),
  },
  no_repeat: {
    fields: [
      { key: 'match', kind: 'match', label: "Don't repeat" },
      { key: 'within', kind: 'within', label: 'Not again within' },
      { key: 'roles', kind: 'roles', label: 'Counting these parts of a meal' },
      scope, strength, cost,
    ],
    defaults: () => ({ match: TRUE, within: 'week', roles: ['base', 'curry', 'subzi'], strength: 'must' }),
  },
  allowed_meals: {
    fields: [
      { key: 'match', kind: 'match', label: 'Dishes' },
      { key: 'meals', kind: 'meals', label: 'Only at' },
      { key: 'days', kind: 'days', label: 'On these days', help: 'Leave empty for every day.', optional: true },
      strength, cost,
    ],
    defaults: () => ({ match: TRUE, meals: ['lunch'], strength: 'must' }),
  },
  skip_when: {
    fields: [
      { key: 'when', kind: 'match', label: 'When a meal contains' },
      { key: 'skip', kind: 'skip', label: 'Leave out' },
      scope, strength, cost,
    ],
    defaults: () => ({ when: TRUE, skip: ['subzi'], strength: 'must' }),
  },
  require_with: {
    fields: [
      { key: 'when', kind: 'match', label: 'When a meal contains' },
      { key: 'components', kind: 'components', label: 'Also include these dishes', optional: true },
      { key: 'extraCategories', kind: 'extraCategories', label: 'And an extra from', optional: true },
      scope, strength, cost,
    ],
    defaults: () => ({ when: TRUE, components: [], extraCategories: [], strength: 'must' }),
  },
  pairs_with: {
    fields: [
      { key: 'match', kind: 'match', label: 'Dishes' },
      { key: 'baseCategories', kind: 'baseCategories', label: 'Only with a base from' },
      strength, cost,
    ],
    defaults: () => ({ match: TRUE, baseCategories: [], strength: 'must' }),
  },
  allowed_days: {
    fields: [
      { key: 'match', kind: 'match', label: 'Dishes' },
      { key: 'days', kind: 'days', label: 'Only on' },
      strength, cost,
    ],
    defaults: () => ({ match: TRUE, days: ['saturday', 'sunday'], strength: 'must' }),
  },
  avoid_with: {
    fields: [
      { key: 'match', kind: 'match', label: 'Dishes' },
      { key: 'with', kind: 'match', label: 'Never in the same meal as' },
      scope, strength, cost,
    ],
    defaults: () => ({ match: TRUE, with: TRUE, strength: 'must' }),
  },
  prefer: {
    fields: [
      { key: 'direction', kind: 'direction', label: 'Prefer or avoid' },
      { key: 'match', kind: 'match', label: 'Dishes' },
      { key: 'weight', kind: 'weight', label: 'How strongly', help: '1 is a slight nudge, 5 a strong one.' },
    ],
    defaults: () => ({ match: TRUE, direction: 'prefer', weight: 2 }),
  },
};

export function newSpec<T extends TemplateId>(template: T): Extract<RuleSpecInput, { template: T }> {
  // Params are typed per template by the form table; the union cannot see that link.
  return { template, params: TEMPLATE_FORMS[template].defaults() } as unknown as Extract<RuleSpecInput, { template: T }>;
}

/** Errors keyed by param key (`match`, `max`, …), `name`, or `rule` for the whole rule. */
export type DraftErrors = Partial<Record<string, string>>;

export interface Draft {
  name: string;
  spec: RuleSpecInput;
}

export type DraftResult = { ok: true; name: string; spec: RuleSpec } | { ok: false; errors: DraftErrors };

/**
 * Validate an editor draft. Beyond the template schema, every condition needs a value and the
 * main condition may not be empty, since "every dish" is almost never what a rule means.
 */
export function validateDraft(draft: Draft): DraftResult {
  const errors: DraftErrors = {};
  if (draft.name.trim() === '') errors.name = 'Give the rule a name';

  const params = draft.spec.params as Record<string, unknown>;
  for (const field of TEMPLATE_FORMS[draft.spec.template].fields) {
    if (field.kind !== 'match') continue;
    const group = fromMatcher(params[field.key] as Matcher);
    if (!group) continue; // advanced conditions are kept as they are
    if (group.conditions.length === 0) errors[field.key] = 'Add at least one condition';
    else if (groupProblems(group).length) errors[field.key] = 'Choose a value for every condition';
  }

  const parsed = RuleSpecSchema.safeParse(draft.spec);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] === 'params' && typeof issue.path[1] === 'string' ? issue.path[1] : 'rule';
      errors[key] ??= issue.message;
    }
  }
  if (Object.keys(errors).length || !parsed.success) return { ok: false, errors };
  return { ok: true, name: draft.name.trim(), spec: parsed.data };
}

/** Library components a matcher picks out, each in its own role. */
export function previewMatches<C extends ComponentLike>(matcher: Matcher, library: readonly C[]): C[] {
  const test = compileMatcher(matcher);
  return library.filter((c) => test({ c, role: c.componentType, day: 'monday', meal: 'lunch' }));
}
