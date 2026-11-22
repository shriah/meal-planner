// The rule case model: a situation written in code (dishes, stored-style rules, the outcome it must
// produce). Cases cover the rule engine and the planner only; nothing here touches app UI code.
import type { Justification, PartSlot, PlannerPart } from '@/planner';
import type { LegacyPins } from '@/services/pins';
import type { PlanSlot } from '@/types/plan';
import type { RuleIssue, RuleRecord } from '@/rules';
import type { DishWithPart } from '@/db/parts';
import type { CategoryRecord } from '@/types/category';
import type { ComponentRecord } from '@/types/component';

export type CaseGroup = 'Pairings' | 'Days and meals' | 'Variety' | 'Locks and picks' | 'Extras';

export interface CaseLibrary {
  /** The library's parts in meal order: the four converted parts (ids 1 to 4) unless the library names its own. */
  parts: PlannerPart[];
  dishes: DishWithPart[];
  categories: CategoryRecord[];
  dish(name: string): ComponentRecord;
  category(name: string): CategoryRecord;
}

/** A rule as a case writes it: the app's owned rules (`linkRule`, `dayRule`, ...) fit. */
export type CaseRule = Omit<RuleRecord, 'id' | 'enabled' | 'created_at'>;

/** A pairing a week left out of a meal, keyed by the part another pairing held; `legacy` reads that part as today's type on a converted library. */
export type CaseSuppressed = Omit<Justification, 'suppressed'> & {
  suppressed: NonNullable<Justification['suppressed']> & { legacy?: 'curry' | 'subzi' };
};

/** The planned weeks of one case: one entry per seed. */
export interface CaseWeeks {
  /** Meals in today's shape, for a converted library. Empty weeks (one per seed) on a library with its own parts. */
  weeks: PlanSlot[][];
  /** Meals by part, for a library with its own parts: one entry per seed. Absent on a converted library. */
  parts?: PartSlot[][];
  /** The hard problems each week was left with. */
  hard: Justification[][];
  /** The soft problems each week was left with. */
  soft: Justification[][];
  /** The pairings each week left out of a meal because another pairing already held the curry or subzi. */
  suppressed: CaseSuppressed[][];
  lib: CaseLibrary;
  /** The rules the planner left out, each named (what `PlanCase.issues` expects). */
  issues?: RuleIssue[];
}

export interface Outcome { pass: boolean; got: string }

export interface PlanExpectation {
  /** The expectation as a plain sentence. */
  says: string;
  check(w: CaseWeeks, ctx: { baseline(): CaseWeeks }): Outcome;
  /** The index (0 for seed 1) of the first week this expectation fails in, when it can tell. */
  failingSeed?(w: CaseWeeks, ctx: { baseline(): CaseWeeks }): number | undefined;
  /** Meals the expectation looks at, marked in the sample week. */
  highlights?(slot: PlanSlot, lib: CaseLibrary): boolean;
}

export interface PlanCase {
  kind: 'plan';
  /** A stable slug. */
  id: string;
  group: CaseGroup;
  name: string;
  why: string;
  /** A library with its own parts; the case then plans and reads part-keyed weeks (`CaseWeeks.parts`), with no legacy conversion. */
  library?: CaseLibrary;
  /** Extra dishes for this case only (ids from 900). Not for a case with its own `library`. */
  dishes?: ComponentRecord[];
  /** The rules the case is about: its expectations must fail without them (and without its pins). */
  rules(lib: CaseLibrary): CaseRule[];
  /** Supporting rules the case needs but is not about; kept when the subject is taken away. */
  given?(lib: CaseLibrary): CaseRule[];
  /** Default rules (by `default_key`) the case is about, taken away with its own rules; `cap:curry` and `cap:subzi` name the caps. */
  without?: string[];
  /** Leave out the default rules. */
  defaults?: false;
  pins?: LegacyPins;
  /** Rule issues the case expects (compileRules skipping a rule): each text must appear in an issue's name or message, and any other issue fails the case. */
  issues?: string[];
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
  /** The dish's component type, or its part's name on a library with its own parts. */
  dishes: { name: string; type: string }[];
  rules: string[];
  expectations: { says: string; pass: boolean; got: string }[];
  /** The seed the sample week was planned with: the first failing seed, else 1. */
  sampleSeed: number;
  sampleWeek?: { slot: PlanSlot | PartSlot; text: string; highlight: boolean }[];
}
