// Scores a whole plan against COUNT and PREFER constraints. The score is lexicographic:
// any hard violation outweighs every soft cost. Each violated group can be justified.
import { byComponent, timeOf, type Constraint, type CountConstraint, type Origin } from './constraints';
import { compileMatcher, type MatchFn } from './matcher';
import {
  DAYS, MEALS, ROLES, SLOT_COUNT, slotDay, slotMeal, titleCase,
  type Assignment, type ComponentLike, type Day, type Meal, type PlanState, type Role,
} from './types';

export type BoundKind = 'hardMin' | 'softMin' | 'softMax' | 'hardMax';

export interface GroupKey {
  day?: Day;
  meal?: Meal;
  /** Sliding window [first, last] day, inclusive. */
  window?: [Day, Day];
  componentId?: number;
}

export interface Justification {
  constraintId: string;
  label: string;
  level: 'hard' | 'soft';
  origin: Origin;
  ruleId?: number;
  group: GroupKey;
  actual: number;
  bound: { kind: BoundKind; value: number };
  /** Units outside the bound. */
  units: number;
  /** Units multiplied by severity (hard) or cost (soft). */
  cost: number;
}

export interface Score {
  /** Hard penalty; 0 means every hard constraint holds. */
  hard: number;
  soft: number;
}

export interface ScoreResult extends Score {
  justifications: Justification[];
}

/** Negative when `a` is better than `b`. */
export const compareScore = (a: Score, b: Score): number => (a.hard !== b.hard ? a.hard - b.hard : a.soft - b.soft);

type Time = 'slot' | 'day' | 'meal' | 'plan' | 'window';

interface CompiledCount {
  def: CountConstraint;
  sel: number;
  /** Matcher index of the trigger, or -1. */
  when: number;
  time: Time;
  win: number;
  /** Number of time groups. */
  T: number;
  byComponent: boolean;
  inScope: Uint8Array;
  counts: Int32Array;
  whenFlag: Uint8Array;
  touched: number[];
  hardMin: number; softMin: number; softMax: number; hardMax: number;
  severity: number; minCost: number; maxCost: number;
}

/** Cached matcher results for one (component, role, slot). */
interface Memo {
  prefer: number;
  /** Count constraints this assignment touches: (index << 2) | 1 if selected | 2 if it triggers `when`. */
  hits: Int32Array;
}

export interface CompiledModel {
  readonly library: readonly ComponentLike[];
  readonly byId: ReadonlyMap<number, ComponentLike>;
  readonly constraints: readonly Constraint[];
  /** Internal, mutable scoring state. A model must not be scored concurrently. */
  readonly state: ScoringState;
}

interface ScoringState {
  idIndex: Map<number, number>;
  counts: CompiledCount[];
  matchers: MatchFn[];
  prefers: { idx: number; weight: number }[];
  memo: (Memo | undefined)[];
  bufCi: Int32Array;
  bufSlot: Int32Array;
  bufMemo: Memo[];
}

/** Built-in id reported for plan entries that reference a component missing from the library. */
export const UNKNOWN_COMPONENT = 'builtin:unknown-component';
const MAX_ASSIGNMENTS = SLOT_COUNT * 16;

export function compileModel(library: readonly ComponentLike[], constraints: readonly Constraint[]): CompiledModel {
  const matchers: MatchFn[] = [];
  const addMatcher = (fn: MatchFn) => matchers.push(fn) - 1;
  const counts: CompiledCount[] = [];
  const prefers: { idx: number; weight: number }[] = [];
  const N = library.length;

  for (const c of constraints) {
    if (c.kind === 'prefer') {
      prefers.push({ idx: addMatcher(compileMatcher(c.select)), weight: c.weight });
      continue;
    }
    const time = timeOf(c.groupBy);
    const kind: Time = typeof time === 'string' ? time : 'window';
    const win = typeof time === 'string' ? 0 : time.days;
    const T = kind === 'slot' ? SLOT_COUNT : kind === 'day' ? DAYS.length : kind === 'meal' ? MEALS.length
      : kind === 'plan' ? 1 : DAYS.length - win + 1;
    const days = c.scope?.days;
    const meals = c.scope?.meals;
    const inScope = new Uint8Array(T).fill(1);
    for (let t = 0; t < T; t++) {
      if (kind === 'slot') inScope[t] = +((!days || days.includes(slotDay(t))) && (!meals || meals.includes(slotMeal(t))));
      else if (kind === 'day') inScope[t] = +(!days || days.includes(DAYS[t]));
      else if (kind === 'meal') inScope[t] = +(!meals || meals.includes(MEALS[t]));
    }
    const b = c.bounds;
    const perComponent = byComponent(c.groupBy);
    counts.push({
      def: c,
      sel: addMatcher(compileMatcher(c.select)),
      when: c.when ? addMatcher(compileMatcher(c.when.exists)) : -1,
      time: kind, win, T, byComponent: perComponent, inScope,
      counts: new Int32Array(T * (perComponent ? N : 1)),
      whenFlag: new Uint8Array(T),
      touched: [],
      hardMin: b.hardMin ?? -Infinity, softMin: b.softMin ?? -Infinity,
      softMax: b.softMax ?? Infinity, hardMax: b.hardMax ?? Infinity,
      severity: c.severity ?? 1, minCost: c.costs?.min ?? 1, maxCost: c.costs?.max ?? 1,
    });
  }

  return {
    library,
    byId: new Map(library.map((c) => [c.id, c])),
    constraints,
    state: {
      idIndex: new Map(library.map((c, i) => [c.id, i])),
      counts, matchers, prefers,
      memo: new Array(N * ROLES.length * SLOT_COUNT),
      bufCi: new Int32Array(MAX_ASSIGNMENTS),
      bufSlot: new Int32Array(MAX_ASSIGNMENTS),
      bufMemo: new Array(MAX_ASSIGNMENTS),
    },
  };
}

function memoFor(m: CompiledModel, ci: number, role: number, slot: number): Memo {
  const st = m.state;
  const key = (ci * ROLES.length + role) * SLOT_COUNT + slot;
  let e = st.memo[key];
  if (!e) {
    const a: Assignment = { c: m.library[ci], role: ROLES[role], day: slotDay(slot), meal: slotMeal(slot) };
    const bits = st.matchers.map((f) => f(a));
    let prefer = 0;
    for (const p of st.prefers) if (bits[p.idx]) prefer += p.weight;
    const hits: number[] = [];
    st.counts.forEach((cc, ck) => {
      const v = (bits[cc.sel] ? 1 : 0) | (cc.when >= 0 && bits[cc.when] ? 2 : 0);
      if (v) hits.push((ck << 2) | v);
    });
    e = st.memo[key] = { prefer, hits: Int32Array.from(hits) };
  }
  return e;
}

const ROLE_INDEX: Record<Role, number> = Object.fromEntries(ROLES.map((r, i) => [r, i])) as Record<Role, number>;

/**
 * Score a plan. With `justify`, also explain every hard and soft violation (slower; used for
 * reporting, not inside the search loop).
 */
export function score(m: CompiledModel, plan: PlanState, justify = false): ScoreResult {
  const st = m.state;
  const { bufCi, bufSlot, bufMemo, counts } = st;
  const just: Justification[] = [];
  let hard = 0;
  let soft = 0;
  let n = 0;

  const place = (id: number, role: number, slot: number) => {
    const ci = st.idIndex.get(id);
    if (ci === undefined) {
      hard += 1;
      if (justify) {
        just.push({
          constraintId: UNKNOWN_COMPONENT, label: 'Component no longer exists', level: 'hard', origin: 'builtin',
          group: { day: slotDay(slot), meal: slotMeal(slot), componentId: id },
          actual: 1, bound: { kind: 'hardMax', value: 0 }, units: 1, cost: 1,
        });
      }
      return;
    }
    if (n >= MAX_ASSIGNMENTS) throw new Error(`plan has more than ${MAX_ASSIGNMENTS} assignments`);
    bufCi[n] = ci;
    bufSlot[n] = slot;
    bufMemo[n] = memoFor(m, ci, role, slot);
    n++;
  };

  for (let slot = 0; slot < plan.length; slot++) {
    const s = plan[slot];
    if (s.base !== undefined) place(s.base, ROLE_INDEX.base, slot);
    if (s.curry !== undefined) place(s.curry, ROLE_INDEX.curry, slot);
    if (s.subzi !== undefined) place(s.subzi, ROLE_INDEX.subzi, slot);
    for (const id of s.extras) place(id, ROLE_INDEX.extra, slot);
  }

  for (const cc of counts) {
    if (cc.byComponent) {
      for (const gi of cc.touched) cc.counts[gi] = 0;
      cc.touched.length = 0;
    } else {
      cc.counts.fill(0);
    }
    if (cc.when >= 0) cc.whenFlag.fill(0);
  }

  // One pass over assignments; each updates only the constraints it touches.
  const N = m.library.length;
  for (let i = 0; i < n; i++) {
    const memo = bufMemo[i];
    soft += memo.prefer;
    const slot = bufSlot[i];
    const day = (slot / MEALS.length) | 0;
    for (const code of memo.hits) {
      const cc = counts[code >> 2];
      const selected = (code & 1) !== 0;
      const triggers = (code & 2) !== 0;
      let lo: number;
      let hi: number;
      switch (cc.time) {
        case 'slot': lo = hi = slot; break;
        case 'day': lo = hi = day; break;
        case 'meal': lo = hi = slot % MEALS.length; break;
        case 'plan': lo = hi = 0; break;
        case 'window': lo = Math.max(0, day - cc.win + 1); hi = Math.min(day, cc.T - 1); break;
      }
      for (let t = lo; t <= hi; t++) {
        if (triggers) cc.whenFlag[t] = 1;
        if (selected) {
          const gi = cc.byComponent ? t * N + bufCi[i] : t;
          if (cc.byComponent && cc.counts[gi] === 0) cc.touched.push(gi);
          cc.counts[gi]++;
        }
      }
    }
  }

  for (const cc of counts) {
    const groups = cc.byComponent ? cc.touched.length : cc.T;
    for (let g = 0; g < groups; g++) {
      const gi = cc.byComponent ? cc.touched[g] : g;
      const t = cc.byComponent ? (gi / N) | 0 : g;
      if (!cc.inScope[t] || (cc.when >= 0 && !cc.whenFlag[t])) continue;
      const c = cc.counts[gi];
      let hardUnits = 0;
      let softCost = 0;
      if (c < cc.hardMin) hardUnits += cc.hardMin - c;
      else if (c < cc.softMin) softCost += (cc.softMin - c) * cc.minCost;
      if (c > cc.hardMax) hardUnits += c - cc.hardMax;
      else if (c > cc.softMax) softCost += (c - cc.softMax) * cc.maxCost;
      hard += hardUnits * cc.severity;
      soft += softCost;
      if (justify && (hardUnits || softCost)) {
        justifyGroup(just, cc, t, c, cc.byComponent ? m.library[gi % N].id : undefined);
      }
    }
  }
  return { hard, soft, justifications: just };
}

function groupKey(cc: CompiledCount, t: number, componentId?: number): GroupKey {
  const g: GroupKey = {};
  if (cc.time === 'slot') { g.day = slotDay(t); g.meal = slotMeal(t); }
  else if (cc.time === 'day') g.day = DAYS[t];
  else if (cc.time === 'meal') g.meal = MEALS[t];
  else if (cc.time === 'window') g.window = [DAYS[t], DAYS[t + cc.win - 1]];
  if (componentId !== undefined) g.componentId = componentId;
  return g;
}

function justifyGroup(out: Justification[], cc: CompiledCount, t: number, actual: number, componentId?: number) {
  const group = groupKey(cc, t, componentId);
  const add = (kind: BoundKind, value: number, units: number, level: 'hard' | 'soft', unitCost: number) => {
    out.push({
      constraintId: cc.def.id, label: cc.def.label, level, origin: cc.def.origin, ruleId: cc.def.ruleId,
      group, actual, bound: { kind, value }, units, cost: units * unitCost,
    });
  };
  if (actual < cc.hardMin) add('hardMin', cc.hardMin, cc.hardMin - actual, 'hard', cc.severity);
  else if (actual < cc.softMin) add('softMin', cc.softMin, cc.softMin - actual, 'soft', cc.minCost);
  if (actual > cc.hardMax) add('hardMax', cc.hardMax, actual - cc.hardMax, 'hard', cc.severity);
  else if (actual > cc.softMax) add('softMax', cc.softMax, actual - cc.softMax, 'soft', cc.maxCost);
}

// ─── Human-readable explanations ──────────────────────────────────────────────

const BOUND_TEXT: Record<BoundKind, string> = {
  hardMin: 'must be at least',
  softMin: 'should be at least',
  softMax: 'should be at most',
  hardMax: 'must be at most',
};

export interface ExplainNames {
  component?: (id: number) => string | undefined;
}

export function groupText(g: GroupKey, names: ExplainNames = {}): string {
  const parts: string[] = [];
  if (g.componentId !== undefined) parts.push(`"${names.component?.(g.componentId) ?? `#${g.componentId}`}"`);
  if (g.day && g.meal) parts.push(`on ${titleCase(g.day)} ${g.meal}`);
  else if (g.day) parts.push(`on ${titleCase(g.day)}`);
  else if (g.meal) parts.push(`at ${g.meal} across the week`);
  else if (g.window) parts.push(`between ${titleCase(g.window[0])} and ${titleCase(g.window[1])}`);
  else parts.push('across the week');
  return parts.join(' ');
}

/** "No non-veg: on Friday lunch has 1, must be at most 0". */
export function explain(j: Justification, names: ExplainNames = {}): string {
  return `${j.label}: ${groupText(j.group, names)} has ${j.actual}, ${BOUND_TEXT[j.bound.kind]} ${j.bound.value}`;
}
