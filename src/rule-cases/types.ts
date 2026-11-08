// The rule case model: a situation written in code (dishes, stored-style rules, the outcome it must
// produce). Cases cover the rule engine and the planner only; nothing here touches app UI code.
import type { Justification, Pins, PlanSlotLike } from '@/planner';
import type { RuleRecord } from '@/rules';
import type { CategoryRecord } from '@/types/category';
import type { ComponentRecord, ComponentType } from '@/types/component';

export type CaseGroup = 'Pairings' | 'Days and meals' | 'Variety' | 'Locks and picks' | 'Extras';

export interface CaseLibrary {
  dishes: ComponentRecord[];
  categories: CategoryRecord[];
  dish(name: string): ComponentRecord;
  category(name: string): CategoryRecord;
}

/** A rule as a case writes it: the app's owned rules (`linkRule`, `dayRule`, ...) fit. */
export type CaseRule = Omit<RuleRecord, 'id' | 'enabled' | 'created_at'>;

/** The planned weeks of one case: one entry per seed. */
export interface CaseWeeks {
  weeks: PlanSlotLike[][];
  /** The hard problems each week was left with. */
  hard: Justification[][];
  lib: CaseLibrary;
}

export interface Outcome { pass: boolean; got: string }

export interface PlanExpectation {
  /** The expectation as a plain sentence. */
  says: string;
  check(w: CaseWeeks, ctx: { baseline(): CaseWeeks }): Outcome;
  /** Meals the expectation looks at, marked in the sample week. */
  highlights?(slot: PlanSlotLike, lib: CaseLibrary): boolean;
}

export interface PlanCase {
  kind: 'plan';
  /** A stable slug. */
  id: string;
  group: CaseGroup;
  name: string;
  why: string;
  /** Extra dishes for this case only (ids from 900). */
  dishes?: ComponentRecord[];
  rules(lib: CaseLibrary): CaseRule[];
  /** Leave out the default rules. */
  defaults?: false;
  pins?: Pins;
  expect: PlanExpectation[];
  /** What is wrong, for a case that fails on today's code. */
  known?: string;
}

export type RuleCase = PlanCase;

export type CaseStatus = 'pass' | 'fail' | 'known' | 'known-now-passes';

export interface CaseResult {
  id: string;
  group: CaseGroup;
  name: string;
  why: string;
  kind: 'plan';
  status: CaseStatus;
  known?: string;
  /** Whether the default rules were planned with the case's own. */
  defaults: boolean;
  dishes: { name: string; type: ComponentType }[];
  rules: string[];
  expectations: { says: string; pass: boolean; got: string }[];
  sampleWeek?: { slot: PlanSlotLike; text: string; highlight: boolean }[];
}
