// Tool registry for the rules assistant: declarations sent to the model plus a never-throwing dispatcher.
import { z } from 'zod';
import { MEALS } from '@/planner';
import { describeSpec, parseSpec, RuleSpecSchema } from '@/rules';
import { explainPlan, missingDishIds } from '@/services/plan-generation';
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
    description: 'Draft a new planning rule from a template for the user to review and save. Does not save anything itself.',
    parameters: obj({
      name: { type: 'string', description: 'Short rule name' },
      template: { type: 'string', description: 'Rule template id' },
      params: { type: 'object', description: 'Template parameters' },
    }, ['name', 'template', 'params']),
  },
  {
    name: 'propose_dish',
    description: 'Draft a new dish for the user to review and save. Does not save anything itself.',
    parameters: obj({
      name: { type: 'string', description: 'Dish name' },
      componentType: { type: 'string', description: 'Dish type, e.g. curry, base, extra' },
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
  async simulate_with_rule(args, ctx) {
    const a = parse(SimulateArgs, args);
    if (!a.ok) return a;
    const spec = RuleSpecSchema.safeParse(a.value.spec);
    if (!spec.success) return { ok: false, error: `invalid rule: ${spec.error.issues.map((i) => i.message).join('; ')}` };
    const comparison = await ctx.compare(spec.data, a.value.name);
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

const NOT_AVAILABLE: ToolResult = { ok: false, error: 'not available' };
const PENDING = new Set(['propose_rule', 'propose_dish']);

export async function runTool(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
  try {
    if (Object.hasOwn(HANDLERS, name)) return await HANDLERS[name](args, ctx);
    if (PENDING.has(name)) return NOT_AVAILABLE;
    return { ok: false, error: `unknown tool ${name}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'tool failed' };
  }
}
