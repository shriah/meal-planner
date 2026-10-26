// Local, no-LLM retrieval: picks the small slice of the user's data relevant to a chat message.
import { describeSpec, parseSpec, specReferences, TEMPLATE_IDS, type Names, type TemplateId } from '@/rules';
import type { PlanningInput } from '@/services/plan-generation';
import {
  CURRY_CATEGORIES, DIETARY_TAGS, OCCASION_TAGS, PROTEIN_TAGS, REGIONAL_TAGS, type ComponentRecord,
} from '@/types/component';
import type { WeeklyPlan } from '@/types/plan';
import { MAX_LIST_ITEMS } from './limits';

export interface AssistantData extends PlanningInput {
  plan?: WeeklyPlan;
}

export interface Slice {
  dishes: { id: number; name: string; type: string }[];
  rules: { id: number; name: string; description: string; enabled: boolean; ownerComponentId?: number }[];
  summary: { categories: string[]; dishCount: number; ruleCount: number; templates: TemplateId[] };
  mentionsAnything: boolean;
}

const MIN_WORD = 3;
const STOP_WORDS = new Set(['the', 'and', 'with', 'for', 'why', 'not', 'any', 'can', 'are', 'does', 'how']);
const TAG_VOCABULARY: readonly string[] = [
  ...new Set([...DIETARY_TAGS, ...PROTEIN_TAGS, ...CURRY_CATEGORIES, ...REGIONAL_TAGS, ...OCCASION_TAGS]),
].filter((t) => t !== 'none');

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const words = (s: string) => norm(s).match(/[a-z0-9]+/g) ?? [];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whole-word (or whole-phrase) occurrence, so "rice" does not match "price". */
const contains = (text: string, phrase: string) => phrase !== '' && new RegExp(`(^|[^a-z0-9])${escape(phrase)}($|[^a-z0-9])`).test(text);

function matchLibrary(message: string, data: AssistantData) {
  const text = norm(message);
  const messageWords = new Set(words(message).filter((w) => w.length >= MIN_WORD && !STOP_WORDS.has(w)));

  const categoryIds = new Set(data.categories.filter((c) => contains(text, norm(c.name))).map((c) => c.id));
  const tags = TAG_VOCABULARY.filter((t) => contains(text, t));

  // 3 = whole name, 2 = a word of the name, 1 = tag or category. Higher scores are kept first when capped.
  const score = (c: ComponentRecord): number => {
    const name = norm(c.name);
    if (contains(text, name)) return 3;
    if (words(name).some((w) => messageWords.has(w))) return 2;
    const own = [...c.dietary_tags, c.protein_tag, c.curry_category, ...c.regional_tags, ...c.occasion_tags];
    if (tags.some((t) => own.includes(t as never))) return 1;
    const cat = c.base_category_id ?? c.extra_category_id;
    return cat != null && categoryIds.has(cat) ? 1 : 0;
  };
  const matched = data.library
    .map((c) => ({ c, s: score(c) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);

  return { matched, matchedIds: new Set(matched.map((x) => x.c.id)), categoryIds, messageWords };
}

/** Every library dish matching the message, best match first (uncapped). */
export function searchLibrary(message: string, data: AssistantData): ComponentRecord[] {
  return matchLibrary(message, data).matched.map((x) => x.c);
}

export function namesFor(data: AssistantData): Names {
  const componentName = new Map(data.library.map((c) => [c.id, c.name]));
  const categoryName = new Map(data.categories.map((c) => [c.id, c.name]));
  return {
    component: (id) => componentName.get(id),
    baseCategory: (id) => categoryName.get(id),
    extraCategory: (id) => categoryName.get(id),
  };
}

export function buildSlice(message: string, data: AssistantData): Slice {
  const { matched, matchedIds, categoryIds, messageWords } = matchLibrary(message, data);
  const names = namesFor(data);

  // 0 = owned by a matched dish, 1 = refers to one, 2 = refers to a matched category, 3 = named in the message.
  const rank = (r: AssistantData['rules'][number]): number => {
    if (r.owner_component_id != null && matchedIds.has(r.owner_component_id)) return 0;
    const parsed = parseSpec(r.spec);
    if (parsed.ok) {
      const refs = specReferences(parsed.spec);
      if (refs.components.some((id) => matchedIds.has(id))) return 1;
      if ([...refs.baseCategories, ...refs.extraCategories].some((id) => categoryIds.has(id))) return 2;
    }
    return words(r.name).some((w) => messageWords.has(w)) ? 3 : -1;
  };
  const matchedRules = data.rules
    .map((r) => ({ r, k: rank(r) }))
    .filter((x) => x.k >= 0)
    .sort((a, b) => a.k - b.k);

  const dishes = matched.slice(0, MAX_LIST_ITEMS).map(({ c }) => ({ id: c.id, name: c.name, type: c.componentType }));
  const rules = matchedRules.slice(0, MAX_LIST_ITEMS).map(({ r }) => {
    const parsed = parseSpec(r.spec);
    return {
      id: r.id,
      name: r.name,
      description: parsed.ok ? describeSpec(parsed.spec, names) : '',
      enabled: r.enabled,
      ...(r.owner_component_id != null ? { ownerComponentId: r.owner_component_id } : {}),
    };
  });

  return {
    dishes,
    rules,
    summary: {
      categories: data.categories.map((c) => c.name),
      dishCount: data.library.length,
      ruleCount: data.rules.length,
      templates: TEMPLATE_IDS,
    },
    mentionsAnything: matched.length > 0 || matchedRules.length > 0,
  };
}
