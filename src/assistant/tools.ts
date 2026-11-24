// Tool registry for the rules assistant: declarations sent to the model plus a never-throwing dispatcher.
import { z } from 'zod';
import { MEALS, type Meal } from '@/planner';
import { bringMode, describeLink, describeWhen, offersLink, pluralNoun, readLink, describeSpec, linkSlotOf, linkWarnings, missingReferences, parseSpec, partsOfDishes, readOwned, RuleSpecSchema, singleParts, singularNoun, STRENGTH_WORDS, HAND_TEMPLATE_IDS, OWNED_ONLY_TEMPLATES, TYPE_FIELDS, validateDraft, type DishLink, type KnownIds, type LinkStrength, type RuleRecord, type RuleSpec } from '@/rules';
import { explainPlan, missingDishIds, broughtByBase, pairedSides, slotConflicts, type PlanProblem, type SlotPart } from '@/services/plan-generation';
import {
  COMPONENT_TYPES, CURRY_CATEGORIES, DIETARY_TAGS, OCCASION_TAGS, PROTEIN_TAGS, REGIONAL_TAGS,
  type ComponentRecord, type ComponentType,
} from '@/types/component';
import { ALL_DAYS, type DayOfWeek, type PlanSlot, type WeeklyPlan } from '@/types/plan';
import type { ToolDeclaration } from './gemini';
import { MAX_LIST_ITEMS } from './limits';
import { dishesWithParts } from '@/db/parts';
import type { PartRecord } from '@/types/part';
import { namesFor, searchLibrary, type AssistantData } from './retrieve';
import type { AssistantEffect, ToolContext } from './types';

export type { AssistantEffect, ToolContext } from './types';
export type ToolResult = { ok: true; data: unknown; effect?: AssistantEffect } | { ok: false; error: string };

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });

// A string, not an object schema: Gemini rejects object parameters declared without properties.
const SPEC_PARAM = {
  type: 'string',
  description: `JSON text of the rule spec: {"template": ..., "params": {...}}. template is one of ${HAND_TEMPLATE_IDS.join('|')}.`,
};

// The strengths a served-with pairing may take, in the words the model uses.
const SERVE_STRENGTHS = ['always', 'usually', 'often', 'sometimes'] as const;
const SERVE_STRENGTH = Object.fromEntries(
  (Object.keys(STRENGTH_WORDS) as LinkStrength[]).map((s) => [STRENGTH_WORDS[s].word, s]),
) as Record<(typeof SERVE_STRENGTHS)[number], LinkStrength>;

// Each entry is one link from the dish to the dishes or categories of one part.
const LINKS_PARAM = {
  type: 'array',
  description: 'Links from this dish, each to the dishes or categories of one part (a part name or id from summary.parts). To a part above the dish\'s own, the dish is added whenever one of them is in the meal (served with); to a part below, the dish brings one of them along (comes with). Each entry is one link, and two entries make two links. A dish links to its own part only where a meal may hold two of it, never in the first part.',
  items: obj({
    part: { type: 'string', description: 'Part name or id, from summary.parts' },
    dishes: { type: 'array', items: { type: 'string' }, description: 'Existing dish names or ids of that part (any one of them will do)' },
    categories: { type: 'array', items: { type: 'string' }, description: 'Existing category names of that part, as summary.parts lists them' },
    strength: { type: 'string', enum: [...SERVE_STRENGTHS], description: 'How firmly: always (default), usually, often or sometimes' },
  }, ['part']),
};

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
    name: 'get_plan',
    description: "Show the current weekly plan: for each day, the dish names at breakfast, lunch and dinner.",
  },
  {
    name: 'explain_rule',
    description: "Explain one planning rule against the current weekly plan in a single call: whether it is switched off or cannot be applied, and every slot where the plan breaks it. Use this for why a rule did not take effect.",
    parameters: obj({ id: { type: 'integer', description: 'Rule id' } }, ['id']),
  },
  {
    name: 'explain_plan_slot',
    description: "Explain one meal slot of the current weekly plan: its dishes (id and name) and the rule problems there. With dish, also checks which rules that dish would break if it were put in the slot; when none would, no rule blocks it and the planner chose other dishes this time. Also lists the dishes in the slot that a pairing brought (pairedWith).",
    parameters: obj({
      day: { type: 'string', description: `Day of the week, lowercase: ${ALL_DAYS.join('|')}` },
      meal: { type: 'string', description: `Meal, lowercase: ${MEALS.join('|')}` },
      dish: { type: 'string', description: 'Optional: a dish name or id, to ask why it is not in this slot' },
    }, ['day', 'meal']),
  },
  {
    name: 'propose_rule',
    description: 'Draft a new planning rule for the user to review and save. Does not save anything itself. Fails with the reasons if the spec is invalid or points at dishes or categories that do not exist; fix and retry.',
    parameters: obj({
      name: { type: 'string', description: 'Short rule name' },
      spec: SPEC_PARAM,
    }, ['name', 'spec']),
  },
  {
    name: 'propose_dish',
    description: 'Draft a new dish for the user to review and save. Does not save anything itself and never creates categories: base_category and extra_category must name an existing category. links pairs it with the dishes of other parts: served with those of a part above it, bringing one of a part below it.',
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
      links: LINKS_PARAM,
    }, ['name', 'componentType']),
  },
  {
    name: 'propose_pairing',
    description: 'Pair a dish already in the library, for the user to review and save. links works as in propose_dish: a link to a part above the dish adds the dish whenever one of them is in the meal; a link to a part below makes the dish bring one of them. Does not save anything itself. The first-part dishes and categories it is already served with are kept.',
    parameters: obj({
      dish: { type: 'string', description: 'Name or id of the dish' },
      links: LINKS_PARAM,
    }, ['dish']),
  },
  {
    name: 'simulate_with_rule',
    description: 'Regenerate the plan with a proposed rule and show which slots would change, without saving anything.',
    parameters: obj({
      name: { type: 'string', description: 'Short rule name' },
      spec: SPEC_PARAM,
    }, ['name', 'spec']),
  },
];

const SearchArgs = z.object({ query: z.string().trim().min(1) });
const GetRuleArgs = z.object({ id: z.number().int() });
const lower = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v);
const ExplainArgs = z.object({
  day: z.preprocess(lower, z.enum(ALL_DAYS as [string, ...string[]])),
  meal: z.preprocess(lower, z.enum(MEALS)),
  dish: z.union([z.string().trim().min(1), z.number().int()]).optional(),
}).passthrough();
// spec arrives as JSON text (as declared); an already-parsed object is accepted too.
const SpecArg = z.union([z.string(), z.record(z.string(), z.unknown())]);
const SimulateArgs = z.object({ name: z.string().trim().min(1), spec: SpecArg });
const ProposeRuleArgs = z.object({ name: z.string().trim().min(1), spec: SpecArg });
const LinksArgs = z.array(z.object({
  part: z.union([z.string().trim().min(1), z.number().int()]),
  dishes: z.array(z.union([z.string().trim().min(1), z.number().int()])).optional(),
  categories: z.array(z.string().trim().min(1)).optional(),
  strength: z.preprocess(lower, z.enum(SERVE_STRENGTHS)).optional(),
}));
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
  links: LinksArgs.optional(),
});
const ProposePairingArgs = z.object({
  dish: z.union([z.string().trim().min(1), z.number().int()]),
  links: LinksArgs.optional(),
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

/** Fields named by any matcher leaf in `value`, however deeply nested in the params. */
function leafFields(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => leafFields(v, out));
  else if (value && typeof value === 'object') {
    if ('field' in value && 'op' in value && typeof value.field === 'string') out.add(value.field);
    else Object.values(value).forEach((v) => leafFields(v, out));
  }
  return out;
}

/**
 * Shared by simulate_with_rule and propose_rule: the spec must satisfy the template schema, not be one only a dish
 * owns, and name parts and categories rather than dish types or the old category fields.
 */
function checkSpec(raw: unknown): { ok: true; spec: RuleSpec } | { ok: false; error: string } {
  let spec = raw;
  if (typeof raw === 'string') {
    try {
      spec = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'spec is not valid JSON; send it again as valid JSON text of { "template": ..., "params": {...} }' };
    }
  }
  const r = RuleSpecSchema.safeParse(spec);
  if (!r.success) return { ok: false, error: `invalid rule: ${r.error.issues.map((i) => i.message).join('; ')}` };
  // A comes-with link is drafted on its dish, where the form checks it against the dish's other links.
  if (OWNED_ONLY_TEMPLATES.includes(r.data.template)) {
    return { ok: false, error: `${r.data.template} is not a rule you can draft here; use links on propose_pairing (or propose_dish) for the dish that brings the side` };
  }
  const old = [...leafFields(r.data.params)].filter((f) => (TYPE_FIELDS as readonly string[]).includes(f));
  if (old.length) {
    return { ok: false, error: `${old.join(', ')} cannot be drafted; use part and category ids from summary.parts in the context (fields part and category)` };
  }
  return { ok: true, spec: r.data };
}

const knownIds = ({ library, categories, parts }: AssistantData): KnownIds => ({
  components: new Set(library.map((c) => c.id)),
  categories: new Set(categories.map((c) => c.id)),
  parts: new Set(parts.map((p) => p.id)),
  // A dish saved without a part has the part planning gives it.
  partOf: partsOfDishes(dishesWithParts(library, parts)),
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

/**
 * The problems that bear on one slot: week-level ones (no day or meal, which includes window
 * groups), that exact slot, that whole day, and that meal across the week. A problem that lists its
 * meals bears on those meals only.
 */
export function problemsForSlot(problems: PlanProblem[], day: DayOfWeek, meal: Meal): PlanProblem[] {
  return problems.filter((p) => p.slots
    ? p.slots.some((s) => s.day === day && s.meal === meal)
    : (p.day === undefined || p.day === day) && (p.meal === undefined || p.meal === meal));
}

type DishRef = { id: number; name: string } | { id: number; deleted: true };
const dishRef = (id: number, data: AssistantData): DishRef => {
  const c = data.library.find((d) => d.id === id);
  return c ? { id, name: c.name } : { id, deleted: true };
};
const dishLabel = (id: number, data: AssistantData) => data.library.find((d) => d.id === id)?.name ?? `#${id} (deleted)`;

function slotDishes(slot: PlanSlot | undefined, data: AssistantData) {
  if (!slot) return null;
  return {
    base: dishRef(slot.base_id, data),
    ...(slot.curry_id !== undefined ? { curry: dishRef(slot.curry_id, data) } : {}),
    ...(slot.subzi_id !== undefined ? { subzi: dishRef(slot.subzi_id, data) } : {}),
    extras: slot.extra_ids.map((id) => dishRef(id, data)),
  };
}

/** One day per entry (at most 7, under the list cap), each meal as its dish names. */
function planByDay(plan: WeeklyPlan, data: AssistantData) {
  return ALL_DAYS.flatMap((day) => {
    const meals = MEALS.flatMap((meal) => {
      const s = plan.slots.find((x) => x.day === day && x.meal_slot === meal);
      if (!s) return [];
      const ids = [s.base_id, s.curry_id, s.subzi_id, ...s.extra_ids].filter((id): id is number => id !== undefined);
      return [[meal, ids.map((id) => dishLabel(id, data))] as const];
    });
    return meals.length ? [{ day, ...Object.fromEntries(meals) }] : [];
  });
}

/** A dish named by id (number or numeric text), exact name, or a single search hit. */
function resolveDish(wanted: string | number, data: AssistantData): { ok: true; dish: ComponentRecord } | { ok: false; error: string } {
  const asId = typeof wanted === 'number' ? wanted : /^\d+$/.test(wanted) ? Number(wanted) : undefined;
  if (asId !== undefined) {
    const byId = data.library.find((c) => c.id === asId);
    return byId ? { ok: true, dish: byId } : { ok: false, error: `no dish with id ${asId}. Use search_dishes to find it.` };
  }
  const name = String(wanted);
  const exact = data.library.filter((c) => normName(c.name) === normName(name));
  const hits = exact.length ? exact : searchLibrary(name, data);
  if (hits.length === 1) return { ok: true, dish: hits[0] };
  if (hits.length === 0) return { ok: false, error: `no dish named "${wanted}". Use search_dishes to find it.` };
  const names = hits.slice(0, MAX_LIST_ITEMS_SIMILAR).map((c) => `${c.name} (id ${c.id})`).join(', ');
  return { ok: false, error: `several dishes match "${wanted}": ${names}. Call again with one id.` };
}

/** An existing category of this kind by name; categories are never created by the assistant. */
function resolveCategory(kind: 'base' | 'extra', wanted: string | undefined, data: AssistantData): { id?: number; error?: string } {
  if (wanted === undefined) return {};
  const options = data.categories.filter((c) => c.kind === kind);
  const hit = options.find((c) => normName(c.name) === normName(wanted));
  if (hit) return { id: hit.id };
  return { error: `no ${kind} category named "${wanted}". Existing ${kind} categories: ${options.map((c) => c.name).join(', ') || '(none)'}. Categories cannot be created here.` };
}

/** The parts in meal order: the first is the one every meal holds one dish of. */
const mealParts = (data: AssistantData): PartRecord[] => [...data.parts].sort((a, b) => a.position - b.position);
const asNumber = (wanted: string | number) => (typeof wanted === 'number' ? wanted : /^\d+$/.test(wanted) ? Number(wanted) : undefined);

/** A part by id (number or numeric text) or name. */
function resolvePart(wanted: string | number, parts: readonly PartRecord[]): { ok: true; part: PartRecord } | { ok: false; error: string } {
  const id = asNumber(wanted);
  const hit = parts.find((p) => (id !== undefined ? p.id === id : normName(p.name) === normName(String(wanted))));
  return hit ? { ok: true, part: hit } : { ok: false, error: `no part named "${wanted}". Parts: ${parts.map((p) => p.name).join(', ') || '(none)'}` };
}

/** Why a dish of `part` may not link to its own part (`offersLink`): the first part, or one a meal holds one dish of. */
const ownPartRefusal = (part: PartRecord, first: number | undefined) => {
  const one = singularNoun(part.name), many = pluralNoun(part.name);
  return part.id === first
    ? `a ${one} cannot be served with ${many}; link the dish that goes with it instead`
    : `a meal holds one ${one}, so a ${one} does not come with ${many}`;
};

/** Whether a link adds its dish when a dish of the first part is in the meal: the dish form's "served with". */
const servesFirst = (l: Pick<DishLink, 'mode' | 'target'>, data: AssistantData) => l.mode === 'serve' && l.target.part === mealParts(data)[0]?.id;

/** A drafted link; its strength is left out when the model gave none, so a stored strength can be kept. */
type DraftedLink = Omit<DishLink, 'strength'> & { strength?: LinkStrength };

/**
 * One link per entry and kind (dishes, then categories) from a dish of `owner.part`, by part: to a lower part the dish
 * brings one of them (comes), to a higher part it is added when one of them is in the meal (serve), as the dish form
 * stores them. Its own part only where `offersLink` allows. Links served with the first part are one link per kind,
 * as the dish form holds them; `servedWith` lists their names as asked.
 */
function draftLinks(
  data: AssistantData,
  owner: { id?: number; part: number },
  entries: z.infer<typeof LinksArgs>,
): { ok: true; links: DraftedLink[]; servedWith: string[] } | { ok: false; error: string } {
  const parts = mealParts(data);
  const first = parts[0]?.id;
  const capped = singleParts(parts, data.rules);
  const placed = dishesWithParts(data.library, data.parts);
  const links: DraftedLink[] = [];
  const servedWith: string[] = [];
  const add = (link: DraftedLink) => {
    const same = link.mode === 'serve' && link.target.part === first ? links.find((l) => linkSlotOf(l) === linkSlotOf(link)) : undefined;
    if (!same) return void links.push(link);
    same.values = [...new Set([...same.values, ...link.values])];
    same.strength = link.strength ?? same.strength;
  };
  for (const entry of entries) {
    const found = resolvePart(entry.part, parts);
    if (!found.ok) return found;
    const { part } = found;
    if (!entry.dishes?.length && !entry.categories?.length) return { ok: false, error: `each links entry needs dishes or categories of its part (${part.name})` };
    const mode = part.id === owner.part ? 'comes' : bringMode(owner.part, part.id, parts);
    if (!offersLink(owner.part, { part: part.id, kind: 'dish' }, parts, mode, capped)) return { ok: false, error: ownPartRefusal(part, first) };
    const strength = entry.strength && SERVE_STRENGTH[entry.strength];
    const one = singularNoun(part.name);
    if (entry.dishes?.length) {
      const inPart = placed.filter((c) => c.part_id === part.id);
      const ids: number[] = [];
      for (const wanted of entry.dishes) {
        const hit = resolveDish(wanted, { ...data, library: inPart });
        if (!hit.ok) {
          const elsewhere = resolveDish(wanted, { ...data, library: placed });
          if (elsewhere.ok) {
            const its = parts.find((p) => p.id === elsewhere.dish.part_id);
            return { ok: false, error: `${elsewhere.dish.name} is not a ${one}; it is in ${its?.name ?? 'another part'}. Name it in an entry for its own part.` };
          }
          if (hit.error.startsWith('several')) return hit;
          return { ok: false, error: `no ${one} named "${wanted}". Existing ${pluralNoun(part.name)}: ${inPart.slice(0, MAX_LIST_ITEMS).map((c) => c.name).join(', ') || '(none)'}` };
        }
        if (hit.dish.id === owner.id) return { ok: false, error: `${hit.dish.name} cannot come with itself` };
        ids.push(hit.dish.id);
      }
      add({ mode, target: { part: part.id, kind: 'dish' }, values: [...new Set(ids)], ...(strength && { strength }) });
    }
    if (entry.categories?.length) {
      const options = data.categories.filter((c) => c.part_id === part.id);
      const ids: number[] = [];
      for (const wanted of entry.categories) {
        const hit = options.find((c) => normName(c.name) === normName(wanted));
        if (!hit) return { ok: false, error: `no ${one} category named "${wanted}". Categories of ${part.name}: ${options.map((c) => c.name).join(', ') || '(none)'}. Categories cannot be created here.` };
        ids.push(hit.id);
      }
      add({ mode, target: { part: part.id, kind: 'category' }, values: [...new Set(ids)], ...(strength && { strength }) });
    }
    if (mode === 'serve' && part.id === first) servedWith.push(...(entry.dishes ?? []).map(String), ...(entry.categories ?? []));
  }
  return { ok: true, links, servedWith };
}

/**
 * The error for links that cannot all hold, in `linkWarnings`' words: two dishes of a part a meal holds one of, always
 * brought or served together. `stored` are the dish's links in force; they are judged with the new ones, but only a
 * clash that lands on a new link is the draft's doing.
 */
function pairingConflict(data: AssistantData, self: { id?: number; name: string; part_id: number }, links: DishLink[], stored: DishLink[] = []): string | undefined {
  return linkWarnings({ id: self.id, name: self.name, part_id: self.part_id }, [...stored, ...links], { dishes: data.library, rules: data.rules, parts: mealParts(data) }, namesFor(data))
    .find((w) => w.blocking && w.link >= stored.length)?.message;
}

const PART_OF: Record<ComponentType, SlotPart> = { base: 'base', curry: 'curry', subzi: 'subzi', extra: 'extras' };

/** The plan without dishes that are no longer in the library, so scoring never meets an unknown id. */
function knownOnly(plan: WeeklyPlan, data: AssistantData): WeeklyPlan {
  const known = new Set(data.library.map((c) => c.id));
  const keep = (id: number | undefined) => (id !== undefined && known.has(id) ? id : undefined);
  return {
    slots: plan.slots.map((s) => ({
      ...s,
      base_id: keep(s.base_id) as number,
      curry_id: keep(s.curry_id),
      subzi_id: keep(s.subzi_id),
      extra_ids: s.extra_ids.filter((id) => known.has(id)),
    })),
  };
}

function whyNot(dish: ComponentRecord, day: DayOfWeek, meal: Meal, plan: WeeklyPlan, data: AssistantData) {
  const part = PART_OF[dish.componentType];
  const ref = { id: dish.id, name: dish.name };
  const slot = plan.slots.find((s) => s.day === day && s.meal_slot === meal);
  const inSlot = slot && [slot.base_id, slot.curry_id, slot.subzi_id, ...slot.extra_ids].includes(dish.id);
  if (inSlot) return { dish: ref, part, blockedBy: [], note: `${dish.name} is already in this slot.` };
  const added = slotConflicts(data, knownOnly(plan, data), day, meal, part, [dish.id]).get(dish.id) ?? [];
  return {
    dish: ref,
    part,
    blockedBy: added.slice(0, MAX_LIST_ITEMS),
    ...(added.length > MAX_LIST_ITEMS ? { more: added.length - MAX_LIST_ITEMS } : {}),
    ...(added.length === 0
      ? {
          note: part === 'base' && broughtByBase(data, dish.id, day, meal).length > 0
            ? `No rule blocks ${dish.name} here; its paired dishes come with it.`
            : `No rule blocks ${dish.name} here; the planner chose other dishes this time.`,
        }
      : { note: `Putting ${dish.name} here would break these rules.` }),
  };
}

/** How a pairing brought a side: by a link of the side's (served with) or of the dish that brought it (comes with, and what it waits for). */
function howBrought(rule: RuleRecord | undefined, by: string, side: string, name: (id: number) => string, data: AssistantData): string {
  const link = rule && readLink(rule, mealParts(data));
  if (link?.mode !== 'comes') return `${side} is served with ${by}`;
  return `${by} comes with ${side}${link.when ? ` when ${describeWhen(link.when, name, namesFor(data))}` : ''}`;
}

/** The dishes in one slot that a pairing brought, named with the dish that brought each. */
function pairedWith(data: AssistantData, plan: WeeklyPlan, day: DayOfWeek, meal: Meal): { dish: string; by: string; how: string }[] {
  const name = (id: number) => data.library.find((c) => c.id === id)?.name ?? `dish ${id}`;
  // The rule that brought the side says how: a served-with rule belongs to the side, a comes-with rule to the dish named in `by`.
  const ruleOf = (ruleId: number | undefined) => data.rules.find((r) => r.id === ruleId);
  return pairedSides(data, knownOnly(plan, data))
    .filter((p) => p.day === day && p.meal === meal)
    .map((p) => ({
      dish: name(p.component),
      by: name(p.by),
      how: howBrought(ruleOf(p.ruleId), name(p.by), name(p.component), name, data),
    }));
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
  get_plan(args, { data }) {
    const a = parse(NoArgs, args ?? {});
    if (!a.ok) return a;
    if (!data.plan) return { ok: true, data: { note: 'no plan' } };
    return { ok: true, data: { days: planByDay(data.plan, data) } };
  },
  explain_rule(args, { data }) {
    const a = parse(GetRuleArgs, args);
    if (!a.ok) return a;
    const rule = data.rules.find((r) => r.id === a.value.id);
    if (!rule) return { ok: false, error: `no rule ${a.value.id}` };
    const parsed = parseSpec(rule.spec);
    const missing = parsed.ok ? missingReferences(parsed.spec, knownIds(data)) : [];
    const { plan } = data;
    const broken = plan ? explainPlan(data, plan).filter((p) => p.ruleId === rule.id) : [];
    const status = !rule.enabled
      ? 'switched off, so the planner ignores it'
      : !parsed.ok
        ? 'invalid, so the planner ignores it'
        : missing.length
          ? 'refers to items that no longer exist, so the planner ignores it'
          : !plan
            ? 'active; there is no plan to check it against'
            : broken.length
              ? 'active, and the current plan breaks it'
              : 'active, and the current plan follows it';
    return {
      ok: true,
      data: {
        note: "Judged under today's rules, which may differ from the rules in force when the plan was made. A soft preference can be unmet without any rule being broken.",
        rule: describeRule(rule, data),
        status,
        ...(missing.length ? { missing } : {}),
        ...capped(broken.map((p) => ({ level: p.level, where: p.message, ...(p.day ? { day: p.day } : {}), ...(p.meal ? { meal: p.meal } : {}) })), 'brokenAt'),
      },
    };
  },
  explain_plan_slot(args, { data }) {
    const a = parse(ExplainArgs, args);
    if (!a.ok) return a;
    const { plan } = data;
    if (!plan) return { ok: true, data: { note: 'no plan' } };
    const day = a.value.day as DayOfWeek;
    const meal = a.value.meal;
    let why: ReturnType<typeof whyNot> | undefined;
    if (a.value.dish !== undefined) {
      const found = resolveDish(a.value.dish, data);
      if (!found.ok) return found;
      why = whyNot(found.dish, day, meal, plan, data);
    }
    const problems = problemsForSlot(explainPlan(data, plan), day, meal);
    const missing = missingDishIds(data, plan);
    return {
      ok: true,
      data: {
        note: "Judged under today's rules, which may differ from the rules in force when the plan was made.",
        day,
        meal,
        dishes: slotDishes(plan.slots.find((s) => s.day === day && s.meal_slot === meal), data),
        ...(why ? { whyNot: why } : {}),
        pairedWith: pairedWith(data, plan, day, meal),
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
    if (missing.length) {
      return { ok: false, error: `the rule refers to ${missing.join(', ')}, which no longer exists. Use search_dishes for dish ids, and summary.parts in the context for part and category ids.` };
    }
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

    const base = resolveCategory('base', v.base_category, data);
    if (base.error) return { ok: false, error: base.error };
    const extra = resolveCategory('extra', v.extra_category, data);
    if (extra.error) return { ok: false, error: extra.error };

    const key = normName(v.name);
    const dup = data.library.find((c) => c.componentType === componentType && normName(c.name) === key);
    if (dup) return { ok: false, error: `already in the library: ${dup.name} (${componentType}). Do not propose it again.` };

    // The draft is saved with its type (until Stage 4), so it goes in the part of its type.
    const part = data.parts.find((p) => p.legacy === componentType)?.id;
    const wanted = v.links ?? [];
    if (wanted.length && part === undefined) return { ok: false, error: `no part holds ${componentType} dishes, so this dish cannot be linked here` };
    const drafted = part === undefined ? { ok: true as const, links: [], servedWith: [] } : draftLinks(data, { part }, wanted);
    if (!drafted.ok) return drafted;
    const links: DishLink[] = drafted.links.map((l) => ({ ...l, strength: l.strength ?? 'always' }));
    const conflict = part === undefined ? undefined : pairingConflict(data, { name: v.name, part_id: part }, links);
    if (conflict) return { ok: false, error: conflict };

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
    const { servedWith } = drafted;
    const others = links.filter((l) => !servesFirst(l, data));
    return {
      ok: true,
      data: { similarExisting: similarNames(v.name, data.library), ...(servedWith.length ? { servedWith } : {}), ...(others.length ? { comesWith: others.map((l) => describeLink(v.name, l, namesFor(data))) } : {}) },
      effect: { kind: 'dish-draft', draft, ...(links.length ? { links } : {}) },
    };
  },
  propose_pairing(args, { data }) {
    const a = parse(ProposePairingArgs, args);
    if (!a.ok) return a;
    const v = a.value;
    const wanted = v.links ?? [];
    if (!wanted.length) return { ok: false, error: 'name at least one link in links: a part and some of its dishes or categories' };
    const parts = mealParts(data);
    const first = parts[0]?.id;
    let wantsFirst = false;
    for (const entry of wanted) {
      const part = resolvePart(entry.part, parts);
      if (!part.ok) return part;
      wantsFirst ||= part.part.id === first;
    }
    const firstRefusal = () => ({ ok: false as const, error: ownPartRefusal(parts[0], first) });
    // A dish of the first part is never served with that part, so look first among the other parts' dishes: a dish
    // there that shares its name with one of the first part is not ambiguous.
    const placed = dishesWithParts(data.library, data.parts);
    const others = placed.filter((c) => c.part_id !== first);
    // An exact first-part name is that dish, not one of another part whose name merely contains it ("Idli" is not "Idli podi").
    const exactly = (c: ComponentRecord) => typeof v.dish === 'string' && normName(c.name) === normName(v.dish);
    const exactFirst = !others.some(exactly) && placed.some((c) => c.part_id === first && exactly(c));
    if (wantsFirst && exactFirst) return firstRefusal();
    let found = exactFirst ? resolveDish(v.dish, { ...data, library: placed }) : resolveDish(v.dish, { ...data, library: others });
    if (!found.ok) {
      const any = resolveDish(v.dish, { ...data, library: placed });
      if (!any.ok || any.dish.part_id !== first) return found;
      if (wantsFirst) return firstRefusal();
      found = any;
    }
    const dish = found.dish as ComponentRecord & { part_id: number };
    const drafted = draftLinks(data, { id: dish.id, part: dish.part_id }, wanted);
    if (!drafted.ok) return drafted;
    // Links served with the first part are one link per kind, so the drafted one replaces the stored one in its slot:
    // carry over the dishes or categories already there and their limits. A switched-off link is not in force: nothing
    // is carried over from it, and saving the draft switches the slot on. Every other link is added beside the stored ones.
    const owned = data.rules.filter((r) => r.owner_component_id === dish.id);
    const stored = readOwned(owned.filter((r) => r.enabled), parts).links;
    const off = readOwned(owned.filter((r) => !r.enabled), parts).links.map(linkSlotOf);
    const already: number[] = [];
    let replacesOff = false;
    // Only what this proposal adds or firms up is checked; a conflict already stored is not made worse by being kept.
    const changed: DishLink[] = [];
    const served = drafted.links.filter((l) => servesFirst(l, data)).map((link): DishLink => {
      const requested = link.strength;
      const before = stored.find((l) => linkSlotOf(l) === linkSlotOf(link));
      if (!before) {
        if (off.includes(linkSlotOf(link))) replacesOff = true;
        const fresh = { ...link, strength: requested ?? 'always' };
        changed.push(fresh);
        return fresh;
      }
      const values = [...new Set([...before.values, ...link.values])];
      // A new strength applies to every value in the link, the stored ones too, so all of them are checked.
      const firmer = (requested ?? before.strength) !== before.strength;
      const added = firmer ? values : link.values.filter((v) => !before.values.includes(v));
      if (added.length) changed.push({ ...link, values: added, strength: requested ?? before.strength });
      if (link.target.kind === 'dish') already.push(...before.values);
      return {
        ...link,
        values,
        strength: requested ?? before.strength,
        ...(before.scope ? { scope: before.scope } : {}),
      };
    });
    const rest: DishLink[] = drafted.links.filter((l) => !servesFirst(l, data)).map((l) => ({ ...l, strength: l.strength ?? 'always' }));
    // Every other drafted link is a new link, so all of it is checked.
    const conflict = pairingConflict(data, dish, [...changed, ...rest], stored);
    if (conflict) return { ok: false, error: conflict };
    return {
      ok: true,
      data: {
        dish: dish.name,
        ...(drafted.servedWith.length ? { servedWith: drafted.servedWith } : {}),
        ...(rest.length ? { comesWith: rest.map((l) => describeLink(dish.name, l, namesFor(data))) } : {}),
        ...(already.length ? { alreadyServedWith: already.map((id) => dishLabel(id, data)) } : {}),
        ...(replacesOff ? { replacesSwitchedOffLink: true } : {}),
      },
      effect: { kind: 'dish-links', dishId: dish.id, dishName: dish.name, links: [...served, ...rest] },
    };
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
