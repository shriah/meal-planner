// Before-and-after sample week: plans with and without a draft rule, same seed and pins.
import { compileMatcher, type Matcher, type Pins } from '@/planner';
import { parseSpec, type RuleSpecInput } from '@/rules';
import { diffPlans, type PlanProblem } from '@/services/plan-generation';
import { DRAFT_RULE_ID, runPlanning } from '@/services/planning';
import type { AssistantData } from './retrieve';
import type { CompareFn } from './types';

/** Both runs use this seed so any difference comes from the draft rule, not from chance. */
export const COMPARE_SEED = 1;

const problemKey = (p: PlanProblem) => `${p.ruleId ?? ''}|${p.day ?? ''}|${p.meal ?? ''}|${p.message}`;

export function makeCompare(data: AssistantData, pins?: Pins, run = runPlanning): CompareFn {
  return async (spec: RuleSpecInput, name: string) => {
    const input = { library: data.library, categories: data.categories, rules: data.rules };
    const opts = { seed: COMPARE_SEED, pins };
    const draft = { id: DRAFT_RULE_ID, name, spec, enabled: true, created_at: '' };
    const before = await run(input, opts);
    const after = await run({ ...input, rules: [...input.rules, draft] }, opts);

    const parsed = parseSpec(spec);
    const match = parsed.ok && 'match' in parsed.spec.params ? (parsed.spec.params.match as Matcher) : undefined;
    const test = match ? compileMatcher(match) : undefined;
    const library = new Map(data.library.map((c) => [c.id, c]));
    const touches = (id: number) => {
      const c = library.get(id);
      return !!(test && c && test({ c, role: c.componentType, day: 'monday', meal: 'lunch' }));
    };

    const names = new Map(data.library.map((c) => [c.id, c.name]));
    const changes = diffPlans(before.plan, after.plan, names, touches);
    const seen = new Set(before.problems.filter((p) => p.level === 'hard').map(problemKey));
    const newHardProblems = after.problems.filter((p) => p.level === 'hard' && !seen.has(problemKey(p)));
    return {
      before: before.plan,
      after: after.plan,
      changes,
      identical: changes.length === 0,
      worse: newHardProblems.length > 0,
      newHardProblems,
    };
  };
}
