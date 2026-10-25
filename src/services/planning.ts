// Loads planning data from the database and generates a plan, off the main thread when possible.
import { db } from '@/db/client';
import type { RuleRecord } from '@/rules';
import { planFromData, type PlanningInput, type PlanningOptions, type PlanningOutcome, type PlanProblem } from './plan-generation';

export async function loadPlanningInput(): Promise<PlanningInput> {
  const [library, categories, rules, prefs] = await Promise.all([
    db.components.toArray(),
    db.categories.toArray(),
    db.rules.toArray(),
    db.preferences.get('prefs'),
  ]);
  return { library, categories, rules, extraLimits: prefs?.extra_quantity_limits };
}

function runInWorker(input: PlanningInput, opts: PlanningOptions): Promise<PlanningOutcome> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./plan-generation.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<PlanningOutcome>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'plan worker failed'));
    };
    worker.postMessage({ input, opts });
  });
}

async function runPlanning(input: PlanningInput, opts: PlanningOptions): Promise<PlanningOutcome> {
  if (typeof Worker === 'undefined') return planFromData(input, opts);
  try {
    return await runInWorker(input, opts);
  } catch {
    // A worker that fails to load (e.g. blocked by the environment) must not stop planning.
    return planFromData(input, opts);
  }
}

export async function generatePlan(opts: PlanningOptions = {}): Promise<PlanningOutcome> {
  return runPlanning(await loadPlanningInput(), opts);
}

/** Id given to a rule that is being edited and is not saved yet. */
export const DRAFT_RULE_ID = -1;

export interface DraftCheck {
  /** Places where the draft itself cannot be met. */
  draftProblems: PlanProblem[];
  /** Other rules the plan breaks once the draft is added. */
  otherProblems: PlanProblem[];
  /** Why the draft would be skipped, if it would be. */
  draftIssue?: string;
}

/**
 * Plan a week with the draft rule added (replacing the rule being edited, if any) and report what
 * cannot be met. Soft problems are left out: they are preferences, not conflicts.
 */
export async function checkDraftRule(draft: Omit<RuleRecord, 'id'>, replacingId?: number): Promise<DraftCheck> {
  const input = await loadPlanningInput();
  const rules = [...input.rules.filter((r) => r.id !== replacingId), { ...draft, id: DRAFT_RULE_ID, enabled: true }];
  const outcome = await runPlanning({ ...input, rules }, { seed: 1 });
  const hard = outcome.problems.filter((p) => p.level === 'hard');
  return {
    draftProblems: hard.filter((p) => p.ruleId === DRAFT_RULE_ID),
    otherProblems: hard.filter((p) => p.ruleId !== DRAFT_RULE_ID),
    draftIssue: outcome.ruleIssues.find((i) => i.ruleId === DRAFT_RULE_ID)?.message,
  };
}
