// Tool registry for the rules assistant: declarations sent to the model plus a never-throwing dispatcher.
import { z } from 'zod';
import { MEALS } from '@/planner';
import { describeSpec, missingReferences, parseSpec, RuleSpecSchema, validateDraft, type KnownIds, type RuleSpec } from '@/rules';
import { explainPlan, missingDishIds } from '@/services/plan-generation';
import {
  COMPONENT_TYPES, CURRY_CATEGORIES, DIETARY_TAGS, OCCASION_TAGS, PROTEIN_TAGS, REGIONAL_TAGS,
  type ComponentRecord, type ComponentType,
} from '@/types/component';
import { ALL_DAYS } from '@/types/plan';
import type { ToolDeclaration } from './gemini';
import { MAX_LIST_ITEMS } from './limits';
import { namesFor, searchLibrary, type AssistantData } from './retrieve';
import type { AssistantEffect, ToolContext } from './types';

export type { AssistantEffect, ToolContext } from './types';
export type ToolResult = { ok: true; data: unknown; effect?: AssistantEffect } | { ok: false; error: string };

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });

export const TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: 'search_dishes',
    description: `Find dishes in the user's library by name, tag or category. Returns up to ${MAX_LIST_ITEMS} matches as id, name and type.`,
    parameters: obj({ query: { type: 'string', description: 'Dish name, tag or category to look for' } }, ['query']),
  },
  {
    name: 'get_rule',
    description: 'Get one planning rule by id: its name, plain-language description and whether it is enabled.',
    parameters: obj({ id: { type: 'integer', description: 'Rule id' } }, ['id']),
  },
  {
    name: 'list_rules',
    description: `List the user's planning rules (id, name, description, enabled), up to ${MAX_LIST_ITEMS}.`,
  },
  {
    name: 'explain_plan_slot',
    description: 'Explain why a meal slot in the current weekly plan has the dish it has, or why a given dish is not there.',
    parameters: obj({
      day: { type: 'string', description: `Day of the week, lowercase: ${ALL_DAYS.join('|')}` },
      meal: { type: 'string', description: `Meal, lowercase: ${MEALS.join('|')}` },
    }, ['day', 'meal']),
  },
  {
    name: 'propose_rule',
    description: 'Draft a new planning rule for the user to review and save. Does not save anything itself. Fails with the reasons if the spec is invalid or points at dishes or categories that do not exist; fix and retry.',
    parameters: obj({
      name: { type: 'string', description: 'Short rule name' },
      spec: { type: 'object', description: 'Rule spec: { template, params }' },
    }, ['name', 'spec']),
  },
  {
    name: 'propose_dish',
    description: 'Draft a new dish for the user to review and save. Does not save anything itself and never creates categories: base_category and extra_category must name an existing category.',
    parameters: obj({
      name: { type: 'string', description: 'Dish name' },
      componentType: { type: 'string', enum: [...COMPONENT_TYPES], description: 'Dish type' },
      base_category: { type: 'string', description: 'Existing base category name (base dishes only)' },
      extra_category: { type: 'string', description: 'Existing extra category name (extra dishes only)' },
      curry_category: { type: 'string', enum: [...CURRY_CATEGORIES], description: 'Curry category (curry dishes only)' },
      dietary_tags: { type: 'array', items: { type: 'string', enum: [...DIETARY_TAGS] } },
      protein_tag: { type: 'string', enum: [...PROTEIN_TAGS] },
      regional_tags: { type: 'array', items: { type: 'string', enum: [...REGIONAL_TAGS] } },
      occasion_tags: { type: 'array', items: { type: 'string', enum: [...OCCASION_TAGS] } },
    }, ['name', 'componentType']),
  },
  {
    name: 'simulate_with_rule',
    description: 'Regenerate the plan with a proposed rule and show which slots would change, without saving anything.',
    parameters: obj({
      name: { type: 'string', description: 'Short rule name' },
      spec: { type: 'object', description: 'Rule spec: { template, params }' },
    }, ['name', 'spec']),
  },
];

const SearchArgs = z.object({ query: z.string().trim().min(1) });
const GetRuleArgs = z.object({ id: z.number().int() });
const lower = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v);
const ExplainArgs = z.object({
  day: z.preprocess(lower, z.enum(ALL_DAYS as [string, ...string[]])),
  meal: z.preprocess(lower, z.enum(MEALS)),
}).passthrough();
const SimulateArgs = z.object({ name: z.string().trim().min(1), spec: z.record(z.string(), z.unknown()) });
const ProposeRuleArgs = z.object({ name: z.string().trim().min(1), spec: z.record(z.string(), z.unknown()) });
const ProposeDishArgs = z.object({
  name: z.string().trim().min(1),
  componentType: z.string(),
  base_category: z.string().trim().min(1).optional(),
  extra_category: z.string().trim().min(1).optional(),
  curry_category: z.string().optional(),
  dietary_tags: z.array(z.string()).optional(),
  protein_tag: z.string().optional(),
  regional_tags: z.array(z.string()).optional(),
  occasion_tags: z.array(z.string()).optional(),
});
const MAX_CHANGES = 21;
const NoArgs = z.object({}).passthrough();

const capped = <T>(items: T[], key: string) => ({
  [key]: items.slice(0, MAX_LIST_ITEMS),
  ...(items.length > MAX_LIST_ITEMS ? { more: items.length - MAX_LIST_ITEMS } : {}),
});

function describeRule(r: AssistantData['rules'][number], data: AssistantData) {
  const parsed = parseSpec(r.spec);
  return {
    id: r.id,
    name: r.name,
    description: parsed.ok ? describeSpec(parsed.spec, namesFor(data)) : '',
    enabled: r.enabled,
  };
}

type Handler = (args: unknown, ctx: ToolContext) => ToolResult | Promise<ToolResult>;
const parse = <S extends z.ZodType>(schema: S, args: unknown): { ok: true; value: z.infer<S> } | { ok: false; error: string } => {
  const r = schema.safeParse(args);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: `invalid arguments: ${r.error.issues.map((i) => i.message).join('; ')}` };
};

/** Shared by simulate_with_rule and propose_rule: the spec must satisfy the template schema. */
function checkSpec(spec: unknown): { ok: true; spec: RuleSpec } | { ok: false; error: string } {
  const r = RuleSpecSchema.safeParse(spec);
  return r.success ? { ok: true, spec: r.data } : { ok: false, error: `invalid rule: ${r.error.issues.map((i) => i.message).join('; ')}` };
}

const knownIds = ({ library, categories }: AssistantData): KnownIds => ({
  components: new Set(library.map((c) => c.id)),
  baseCategories: new Set(categories.filter((c) => c.kind === 'base').map((c) => c.id)),
  extraCategories: new Set(categories.filter((c) => c.kind === 'extra').map((c) => c.id)),
});

const normName = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const GENERIC_WORDS = new Set(['rice', 'curry', 'masala', 'fry', 'with', 'and', 'special']);
// Spelling variants such as sambar / sambhar share a key once h is dropped.
const wordKey = (w: string) => w.replace(/h/g, '');
const significantWords = (s: string) =>
  new Set((normName(s).match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w)).map(wordKey));

function similarNames(name: string, library: ComponentRecord[]): string[] {
  const n = normName(name);
  const mine = significantWords(name);
  const found = library.filter((c) => {
    const other = normName(c.name);
    if (n.includes(other) || other.includes(n)) return true;
    return [...significantWords(c.name)].some((w) => mine.has(w));
  }).map((c) => c.name);
  return [...new Set(found)].slice(0, MAX_LIST_ITEMS_SIMILAR);
}
const MAX_LIST_ITEMS_SIMILAR = 5;

function badValues(label: string, values: string[] | undefined, valid: readonly string[]): string | undefined {
  const bad = (values ?? []).filter((v) => !valid.includes(v));
  return bad.length ? `unknown ${label} ${bad.map((b) => `"${b}"`).join(', ')}; valid values: ${valid.join(', ')}` : undefined;
}

const HANDLERS: Record<string, Handler> = {
  search_dishes(args, { data }) {
    const a = parse(SearchArgs, args);
    if (!a.ok) return a;
    const dishes = searchLibrary(a.value.query, data).map((c) => ({ id: c.id, name: c.name, type: c.componentType }));
    return { ok: true, data: capped(dishes, 'dishes') };
  },
  get_rule(args, { data }) {
    const a = parse(GetRuleArgs, args);
    if (!a.ok) return a;
    const rule = data.rules.find((r) => r.id === a.value.id);
    return rule ? { ok: true, data: describeRule(rule, data) } : { ok: false, error: `no rule ${a.value.id}` };
  },
  list_rules(args, { data }) {
    const a = parse(NoArgs, args ?? {});
    if (!a.ok) return a;
    return { ok: true, data: capped(data.rules.map((r) => describeRule(r, data)), 'rules') };
  },
  explain_plan_slot(args, { data }) {
    const a = parse(ExplainArgs, args);
    if (!a.ok) return a;
    const { plan } = data;
    if (!plan) return { ok: true, data: { note: 'no plan' } };
    const { day, meal } = a.value;
    const problems = explainPlan(data, plan).filter((p) => (p.day === undefined && p.meal === undefined) || (p.day === day && p.meal === meal));
    const missing = missingDishIds(data, plan);
    return {
      ok: true,
      data: {
        note: "Judged under today's rules, which may differ from the rules in force when the plan was made.",
        day,
        meal,
        problems: problems.slice(0, MAX_LIST_ITEMS),
        ...(problems.length > MAX_LIST_ITEMS ? { more: problems.length - MAX_LIST_ITEMS } : {}),
        ...(missing.length
          ? {
              missingDishIds: missing,
              deletedDishNote: 'Problems at these slots may stem from a deleted dish rather than a rule.',
            }
          : {}),
      },
    };
  },
  propose_rule(args, { data }) {
    const a = parse(ProposeRuleArgs, args);
    if (!a.ok) return a;
    const spec = checkSpec(a.value.spec);
    if (!spec.ok) return spec;
    const draft = validateDraft({ name: a.value.name, spec: spec.spec });
    if (!draft.ok) return { ok: false, error: `invalid rule: ${Object.values(draft.errors).join('; ')}` };
    const missing = missingReferences(draft.spec, knownIds(data));
    if (missing.length) return { ok: false, error: `the rule refers to things that do not exist: ${missing.join(', ')}. Use search_dishes to find real ids.` };
    return { ok: true, data: { name: draft.name, description: describeSpec(draft.spec, namesFor(data)) }, effect: { kind: 'rule-draft', draft: { name: draft.name, spec: draft.spec } } };
  },
  propose_dish(args, { data }) {
    const a = parse(ProposeDishArgs, args);
    if (!a.ok) return a;
    const v = a.value;
    if (!(COMPONENT_TYPES as readonly string[]).includes(v.componentType)) {
      return { ok: false, error: `unknown componentType "${v.componentType}"; valid values: ${COMPONENT_TYPES.join(', ')}` };
    }
    const componentType = v.componentType as ComponentType;
    const tagError =
      badValues('dietary_tags', v.dietary_tags, DIETARY_TAGS) ??
      badValues('regional_tags', v.regional_tags, REGIONAL_TAGS) ??
      badValues('occasion_tags', v.occasion_tags, OCCASION_TAGS) ??
      badValues('protein_tag', v.protein_tag === undefined ? undefined : [v.protein_tag], PROTEIN_TAGS) ??
      badValues('curry_category', v.curry_category === undefined ? undefined : [v.curry_category], CURRY_CATEGORIES);
    if (tagError) return { ok: false, error: tagError };
    if (v.curry_category && componentType !== 'curry') return { ok: false, error: 'curry_category only applies to curry dishes' };
    if (v.base_category && componentType !== 'base') return { ok: false, error: 'base_category only applies to base dishes' };
    if (v.extra_category && componentType !== 'extra') return { ok: false, error: 'extra_category only applies to extra dishes' };

    const resolve = (kind: 'base' | 'extra', wanted: string | undefined): { id?: number; error?: string } => {
      if (wanted === undefined) return {};
      const options = data.categories.filter((c) => c.kind === kind);
      const hit = options.find((c) => normName(c.name) === normName(wanted));
      if (hit) return { id: hit.id };
      return { error: `no ${kind} category named "${wanted}". Existing ${kind} categories: ${options.map((c) => c.name).join(', ') || '(none)'}. Categories cannot be created here.` };
    };
    const base = resolve('base', v.base_category);
    if (base.error) return { ok: false, error: base.error };
    const extra = resolve('extra', v.extra_category);
    if (extra.error) return { ok: false, error: extra.error };

    const key = normName(v.name);
    const dup = data.library.find((c) => c.componentType === componentType && normName(c.name) === key);
    if (dup) return { ok: false, error: `already in the library: ${dup.name} (${componentType}). Do not propose it again.` };

    const draft: Partial<ComponentRecord> & { componentType: ComponentType } = {
      name: v.name,
      componentType,
      ...(base.id !== undefined ? { base_category_id: base.id } : {}),
      ...(extra.id !== undefined ? { extra_category_id: extra.id } : {}),
      ...(v.curry_category ? { curry_category: v.curry_category as ComponentRecord['curry_category'] } : {}),
      ...(v.dietary_tags ? { dietary_tags: v.dietary_tags as ComponentRecord['dietary_tags'] } : {}),
      ...(v.protein_tag ? { protein_tag: v.protein_tag as ComponentRecord['protein_tag'] } : {}),
      ...(v.regional_tags ? { regional_tags: v.regional_tags as ComponentRecord['regional_tags'] } : {}),
      ...(v.occasion_tags ? { occasion_tags: v.occasion_tags as ComponentRecord['occasion_tags'] } : {}),
    };
    return { ok: true, data: { similarExisting: similarNames(v.name, data.library) }, effect: { kind: 'dish-draft', draft } };
  },
  async simulate_with_rule(args, ctx) {
    const a = parse(SimulateArgs, args);
    if (!a.ok) return a;
    const spec = checkSpec(a.value.spec);
    if (!spec.ok) return spec;
    const comparison = await ctx.compare(spec.spec, a.value.name);
    const { changes, identical, worse } = comparison;
    return {
      ok: true,
      data: {
        identical,
        worse,
        changes: changes.slice(0, MAX_CHANGES).map(({ day, meal, before, after, touchedByRule }) => ({ day, meal, before, after, touchedByRule })),
        ...(changes.length > MAX_CHANGES ? { more: changes.length - MAX_CHANGES } : {}),
        ...(worse ? { newProblems: comparison.newHardProblems.slice(0, MAX_LIST_ITEMS).map((p) => p.message) } : {}),
      },
      effect: { kind: 'comparison', comparison },
    };
  },
};


export async function runTool(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
  try {
    if (Object.hasOwn(HANDLERS, name)) return await HANDLERS[name](args, ctx);
    return { ok: false, error: `unknown tool ${name}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'tool failed' };
  }
}
