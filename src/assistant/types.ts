// Shared shapes for assistant tools. CompareFn is implemented in a later task.
import type { Meal } from '@/planner';
import type { Draft, RuleSpecInput } from '@/rules';
import type { PlanProblem } from '@/services/plan-generation';
import type { ComponentRecord, ComponentType } from '@/types/component';
import type { DayOfWeek, WeeklyPlan } from '@/types/plan';
import type { AssistantData } from './retrieve';

export type SlotChange = { day: DayOfWeek; meal: Meal; before: string; after: string; touchedByRule: boolean };

export type Comparison = {
  before: WeeklyPlan;
  after: WeeklyPlan;
  changes: SlotChange[];
  identical: boolean;
  worse: boolean;
  newHardProblems: PlanProblem[];
};

export type CompareFn = (spec: RuleSpecInput, name: string) => Promise<Comparison>;

export type AssistantEffect =
  | { kind: 'rule-draft'; draft: Draft }
  | { kind: 'dish-draft'; draft: Partial<ComponentRecord> & { componentType: ComponentType } }
  | { kind: 'comparison'; comparison: Comparison };

export interface ToolContext {
  data: AssistantData;
  compare: CompareFn;
}
