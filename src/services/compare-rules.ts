// Plans the week with two rule sets (same seed and pins) and reports which meals change.
import type { Pins } from '@/planner';
import { linkRule, ownedSlot, PLAIN_OWNED_SLOTS, type LinkChange, type OwnedRule, type OwnedRuleChanges, type RuleRecord } from '@/rules';
import type { Comparison } from '@/assistant/types';
import { diffPlans, type PlanningInput, type PlanProblem } from './plan-generation';
import { runPlanning } from './planning';

/** Both runs use this seed so any difference comes from the rules, not from chance. */
export const COMPARE_SEED = 1;

const problemKey = (p: PlanProblem) => `${p.ruleId ?? ''}|${p.day ?? ''}|${p.meal ?? ''}|${p.message}`;

export async function compareRuleSets(
  input: PlanningInput,
  after: RuleRecord[],
  opts: { seed: number; pins?: Pins; touches?: (componentId: number) => boolean },
  run = runPlanning,
): Promise<Comparison> {
  const planOpts = { seed: opts.seed, pins: opts.pins };
  const before = await run(input, planOpts);
  const next = await run({ ...input, rules: after }, planOpts);

  const names = new Map(input.library.map((c) => [c.id, c.name]));
  const changes = diffPlans(before.plan, next.plan, names, opts.touches);
  const seen = new Set(before.problems.filter((p) => p.level === 'hard').map(problemKey));
  const newHardProblems = next.problems.filter((p) => p.level === 'hard' && !seen.has(problemKey(p)));
  return {
    before: before.plan,
    after: next.plan,
    changes,
    identical: changes.length === 0,
    worse: newHardProblems.length > 0,
    newHardProblems,
  };
}

/** The rules as they would be once the dish form is saved, applied the way saveComponent applies them. */
export function pendingRules(
  rules: RuleRecord[],
  dishId: number,
  changes: OwnedRuleChanges,
  dishName: string,
  links: readonly LinkChange[] = [],
): RuleRecord[] {
  let out = [...rules];
  let nextId = -1;
  const self = { id: dishId, name: dishName };
  const add = (rule: OwnedRule) => out.push({ ...rule, id: nextId--, enabled: true, created_at: '' });
  for (const slot of PLAIN_OWNED_SLOTS) {
    const build = changes[slot];
    if (build === undefined) continue;
    const current = out.find((r) => r.owner_component_id === dishId && ownedSlot(r) === slot);
    if (build === null) {
      if (current) out = out.filter((r) => r !== current);
      continue;
    }
    const rule = build(self);
    // An update keeps the stored rule's id, state and date, as the database update does.
    if (current) out = out.map((r) => (r === current ? { ...current, ...rule } : r));
    else add(rule);
  }
  for (const change of links) {
    if (change.kind === 'add') {
      add(linkRule(self, change.link));
      continue;
    }
    const current = out.find((r) => r.id === change.ruleId && r.owner_component_id === dishId);
    if (!current) continue;
    if (change.kind === 'remove') out = out.filter((r) => r !== current);
    // A written link keeps its id and date and is switched on.
    else out = out.map((r) => (r === current ? { ...current, ...linkRule(self, change.link), enabled: true } : r));
  }
  return out;
}
