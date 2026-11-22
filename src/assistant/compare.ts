// Before-and-after sample week: plans with and without a draft rule, same seed and pins.
import { compileMatcher, type Matcher } from '@/planner';
import { matchesDish, parseSpec, type RuleSpecInput } from '@/rules';
import type { LegacyPins } from '@/services/pins';
import { COMPARE_SEED, compareRuleSets } from '@/services/compare-rules';
import { DRAFT_RULE_ID, runPlanning } from '@/services/planning';
import type { AssistantData } from './retrieve';
import type { CompareFn } from './types';

export { COMPARE_SEED };

export function makeCompare(data: AssistantData, pins?: LegacyPins, run = runPlanning): CompareFn {
  return async (spec: RuleSpecInput, name: string) => {
    const input = { library: data.library, categories: data.categories, rules: data.rules, parts: data.parts };
    const draft = { id: DRAFT_RULE_ID, name, spec, enabled: true, created_at: '' };

    const parsed = parseSpec(spec);
    const match = parsed.ok && 'match' in parsed.spec.params ? (parsed.spec.params.match as Matcher) : undefined;
    const test = match ? compileMatcher(match) : undefined;
    const library = new Map(data.library.map((c) => [c.id, c]));
    const touches = (id: number) => {
      const c = library.get(id);
      return !!(test && c && matchesDish(test, c));
    };

    return compareRuleSets(input, [...input.rules, draft], { seed: COMPARE_SEED, pins, touches }, run);
  };
}
