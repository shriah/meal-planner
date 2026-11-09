// Scores a whole plan against COUNT, PREFER and PAIR constraints. The score is lexicographic:
// any hard violation outweighs every soft cost. Each violated group can be justified.
// Sides a meal's dishes bring by PAIR constraints (unit members and asked-for sides) are worked out
// per meal first; rules flagged `yieldsTo` give way to them.
import { byComponent, timeOf, type Constraint, type CountConstraint, type Origin, type PairConstraint } from './constraints';
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
  /** On a pairing that names more than one dish: every candidate, in library order (`group.componentId` is the first). */
  candidates?: number[];
  /**
   * Set on a pairing that is not enforced in this meal because another pairing holds the role
   * (a meal holds one curry and one subzi): `by` triggered it; `heldBy`, if known, holds the role by a
   * pairing on `heldWith`.
   */
  suppressed?: { by: number; role: 'curry' | 'subzi'; heldBy?: number; heldMust?: boolean; heldWith?: number };
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
  /** 0 = never gives way, else YIELD_UNIT or YIELD_ASK. */
  yields: number;
  /** Owning component id, or NaN. */
  owner: number;
}

interface CompiledPair {
  def: PairConstraint;
  when: number;
  /** Library indices of the candidates (the dishes matching `of`), in library order. Empty: never triggered. */
  cis: Int32Array;
  /** Per library index, 1 for a candidate. */
  isCandidate: Uint8Array;
  /** ROLE_CURRY or ROLE_SUBZI when the first candidate fills one of those roles, else 0. A meal holds one of each. */
  roleBit: number;
  must: boolean;
  cost: number;
  inScope: Uint8Array;
}

/** One pairing a placed dish brings: the meal should hold one of `of` (ids in library order). */
export interface Want { of: readonly number[]; unit: boolean }

/** What placing one dish brings, after conflict resolution. */
export interface Brings { wants: Want[] }

/** Cached matcher results for one (component, role, slot). */
interface Memo {
  /** Prefer weights split by whom they give way to. */
  prefer: number;
  preferUnit: number;
  preferAsk: number;
  /** Count constraints this assignment touches: (index << 2) | 1 if selected | 2 if it triggers `when`. */
  hits: Int32Array;
  /** Pairs this assignment triggers, in constraint order: (index << 1) | 1 if suppressed by a conflict. */
  pairs: Int32Array;
  /** The dish's own rules that forbid this assignment and give way only to a unit member (days, meals, never-auto). */
  overrides: number;
  brings?: Brings;
}

/** Flags of an assignment in its meal. Every unit member is also asked for. */
const ASKED = 1;
const UNIT = 2;
const YIELD_UNIT = 1;
const YIELD_ASK = 2;
const ROLE_CURRY = 1;
const ROLE_SUBZI = 2;
const roleBitOf = (r: Role): number => (r === 'curry' ? ROLE_CURRY : r === 'subzi' ? ROLE_SUBZI : 0);
const yieldCode = (y: 'unit' | 'ask' | undefined): number => (y === 'unit' ? YIELD_UNIT : y === 'ask' ? YIELD_ASK : 0);

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
  prefers: { idx: number; weight: number; yields: number }[];
  pairs: CompiledPair[];
  memo: (Memo | undefined)[];
  bufCi: Int32Array;
  bufSlot: Int32Array;
  bufMemo: Memo[];
  bufFlag: Uint8Array;
  /** Per pair, while one slot is scored: 0 untouched, 1 only suppressed, 2 enforced. */
  pairState: Uint8Array;
  bufPairs: Int32Array;
  /** Per pair, while one slot is scored: library index of the first dish that triggered it. */
  pairBy: Int32Array;
  /** Per pair, while one slot is scored: 1 if a candidate of this enforced `must` pair is in the meal (it holds a unit member). */
  pairUnit: Uint8Array;
}

const NO_PAIRS = new Int32Array(0);

/** Built-in id reported for plan entries that reference a component missing from the library. */
export const UNKNOWN_COMPONENT = 'builtin:unknown-component';
const MAX_ASSIGNMENTS = SLOT_COUNT * 16;

export function compileModel(library: readonly ComponentLike[], constraints: readonly Constraint[]): CompiledModel {
  const matchers: MatchFn[] = [];
  const addMatcher = (fn: MatchFn) => matchers.push(fn) - 1;
  const counts: CompiledCount[] = [];
  const prefers: { idx: number; weight: number; yields: number }[] = [];
  const pairs: CompiledPair[] = [];
  const N = library.length;
  const idIndex = new Map(library.map((c, i) => [c.id, i]));

  for (const c of constraints) {
    if (c.kind === 'prefer') {
      prefers.push({ idx: addMatcher(compileMatcher(c.select)), weight: c.weight, yields: yieldCode(c.yieldsTo) });
      continue;
    }
    if (c.kind === 'pair') {
      // Candidates are matched as their own type, at the first slot: `of` names dishes, `scope` times.
      const of = compileMatcher(c.of);
      const isCandidate = new Uint8Array(N);
      const cis: number[] = [];
      library.forEach((d, i) => {
        if (of({ c: d, role: d.componentType, day: slotDay(0), meal: slotMeal(0) })) {
          isCandidate[i] = 1;
          cis.push(i);
        }
      });
      const inScope = new Uint8Array(SLOT_COUNT);
      for (let t = 0; t < SLOT_COUNT; t++) {
        inScope[t] = +((!c.scope?.days || c.scope.days.includes(slotDay(t))) && (!c.scope?.meals || c.scope.meals.includes(slotMeal(t))));
      }
      pairs.push({
        def: c, when: addMatcher(compileMatcher(c.when)), cis: Int32Array.from(cis), isCandidate,
        roleBit: cis.length ? roleBitOf(library[cis[0]].componentType) : 0,
        must: c.strength === 'must', cost: c.cost ?? 10, inScope,
      });
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
      yields: yieldCode(c.yieldsTo), owner: c.owner ?? NaN,
    });
  }

  // A softer pairing gives way where the sides' own rules forbid every candidate (their "never planned
  // automatically", days or meals): there it is not enforced, so no side is brought or missed. Only
  // `must` pairs make the sides' own rules give way.
  for (const p of pairs) {
    if (p.must || !p.cis.length) continue;
    const sides = Array.from(p.cis, (ci) => {
      const side = library[ci];
      return { side, own: counts.filter((cc) => cc.owner === side.id && cc.hardMax === 0 && cc.when < 0 && cc.yields !== YIELD_ASK) };
    });
    if (sides.some((x) => !x.own.length)) continue;
    for (let t = 0; t < SLOT_COUNT; t++) {
      if (!p.inScope[t]) continue;
      const forbidden = sides.every(({ side, own }) => {
        const a: Assignment = { c: side, role: side.componentType, day: slotDay(t), meal: slotMeal(t) };
        return own.some((cc) => groupInScope(cc, t) && matchers[cc.sel](a));
      });
      if (forbidden) p.inScope[t] = 0;
    }
  }

  return {
    library,
    byId: new Map(library.map((c) => [c.id, c])),
    constraints,
    state: {
      idIndex,
      counts, matchers, prefers, pairs,
      memo: new Array(N * ROLES.length * SLOT_COUNT),
      bufCi: new Int32Array(MAX_ASSIGNMENTS),
      bufSlot: new Int32Array(MAX_ASSIGNMENTS),
      bufMemo: new Array(MAX_ASSIGNMENTS),
      bufFlag: new Uint8Array(MAX_ASSIGNMENTS),
      pairState: new Uint8Array(pairs.length),
      bufPairs: new Int32Array(pairs.length),
      pairBy: new Int32Array(pairs.length),
      pairUnit: new Uint8Array(pairs.length),
    },
  };
}

/** Whether the count's time group holding slot `t` is in its scope. */
function groupInScope(cc: CompiledCount, t: number): boolean {
  switch (cc.time) {
    case 'slot': return !!cc.inScope[t];
    case 'day': return !!cc.inScope[(t / MEALS.length) | 0];
    case 'meal': return !!cc.inScope[t % MEALS.length];
    default: return true;
  }
}

function memoFor(m: CompiledModel, ci: number, role: number, slot: number): Memo {
  const st = m.state;
  const key = (ci * ROLES.length + role) * SLOT_COUNT + slot;
  let e = st.memo[key];
  if (!e) {
    const a: Assignment = { c: m.library[ci], role: ROLES[role], day: slotDay(slot), meal: slotMeal(slot) };
    const bits = st.matchers.map((f) => f(a));
    const prefer = [0, 0, 0];
    for (const p of st.prefers) if (bits[p.idx]) prefer[p.yields] += p.weight;
    const hits: number[] = [];
    let overrides = 0;
    st.counts.forEach((cc, ck) => {
      const v = (bits[cc.sel] ? 1 : 0) | (cc.when >= 0 && bits[cc.when] ? 2 : 0);
      if (v) hits.push((ck << 2) | v);
      if (bits[cc.sel] && cc.owner === a.c.id && cc.hardMax === 0 && cc.when < 0 && cc.yields === YIELD_UNIT && groupInScope(cc, slot)) overrides++;
    });
    // Pairs this dish triggers (not those it is a candidate of). A meal holds one curry and one subzi, so
    // the first pair to claim either role wins, `must` pairs before `prefer` ones, each in constraint
    // order; a later pair for the same role is suppressed when it shares no candidate with the first.
    // Extras never conflict.
    const triggered: number[] = [];
    st.pairs.forEach((p, pk) => {
      if (p.cis.length && p.inScope[slot] && bits[p.when] && !p.isCandidate[ci]) triggered.push(pk);
    });
    const claimedBy = new Map<number, CompiledPair>();
    const suppressed = new Set<number>();
    for (const must of [true, false]) {
      for (const pk of triggered) {
        const p = st.pairs[pk];
        if (p.must !== must || !p.roleBit) continue;
        const first = claimedBy.get(p.roleBit);
        if (first === undefined) claimedBy.set(p.roleBit, p);
        else if (!sharesCandidate(first, p)) suppressed.add(pk);
      }
    }
    const pairs = triggered.map((pk) => (pk << 1) | +suppressed.has(pk));
    e = st.memo[key] = {
      prefer: prefer[0], preferUnit: prefer[YIELD_UNIT], preferAsk: prefer[YIELD_ASK],
      hits: Int32Array.from(hits), pairs: pairs.length ? Int32Array.from(pairs) : NO_PAIRS, overrides,
    };
  }
  return e;
}

const sharesCandidate = (a: CompiledPair, b: CompiledPair): boolean => {
  for (const ci of b.cis) if (a.isCandidate[ci]) return true;
  return false;
};

const candidateIds = (m: CompiledModel, p: CompiledPair): number[] => Array.from(p.cis, (ci) => m.library[ci].id);

/**
 * What placing `id` in `role` at `slot` brings, after conflict resolution: one want per enforced pair,
 * `unit` for `must` pairs. Memoised.
 */
export function bringsWith(m: CompiledModel, id: number, role: Role, slot: number): Brings {
  const ci = m.state.idIndex.get(id);
  if (ci === undefined) return { wants: [] };
  const memo = memoFor(m, ci, ROLE_INDEX[role], slot);
  if (!memo.brings) {
    const wants: Want[] = [];
    for (const code of memo.pairs) {
      if (code & 1) continue;
      const p = m.state.pairs[code >> 1];
      wants.push({ of: candidateIds(m, p), unit: p.must });
    }
    memo.brings = { wants };
  }
  return memo.brings;
}

/**
 * How many of the dish's own rules (its days, meals, "never planned automatically") forbid placing `id` in
 * `role` at `slot`. Placed as a unit member, the dish overrides them: they give way and the score does not
 * count them. Memoised.
 */
export function ownRulesOverridden(m: CompiledModel, id: number, role: Role, slot: number): number {
  const ci = m.state.idIndex.get(id);
  return ci === undefined ? 0 : memoFor(m, ci, ROLE_INDEX[role], slot).overrides;
}

/**
 * The summed weight of the prefer rules that match `id` in `role` at `slot` and give way to a unit member
 * (by default "Prefer frequent dishes" and "Avoid rare dishes"): what the score leaves out when the dish is
 * brought as one. Memoised.
 */
export function unitPreferWeight(m: CompiledModel, id: number, role: Role, slot: number): number {
  const ci = m.state.idIndex.get(id);
  return ci === undefined ? 0 : memoFor(m, ci, ROLE_INDEX[role], slot).preferUnit;
}

export interface SlotPair {
  /** The dishes that meet the pairing, in library order. */
  candidates: number[];
  /** The candidate present in the meal, if any. */
  component?: number;
  /** Id of the dish whose pairing brings it. */
  by: number;
  /** Brought by a `must` pair that is enforced. */
  unit: boolean;
  /** Not enforced because another pair from the same dish claims the same role (curry or subzi). */
  suppressed?: boolean;
}

/** The pairings triggered in one meal, whether or not the side is there. */
export function slotPairs(m: CompiledModel, plan: PlanState, slot: number): SlotPair[] {
  const out: SlotPair[] = [];
  const s = plan[slot];
  const inMeal = [s.base, s.curry, s.subzi, ...s.extras].filter((d): d is number => d !== undefined);
  const visit = (id: number | undefined, role: Role) => {
    if (id === undefined) return;
    const ci = m.state.idIndex.get(id);
    if (ci === undefined) return;
    for (const code of memoFor(m, ci, ROLE_INDEX[role], slot).pairs) {
      const p = m.state.pairs[code >> 1];
      const component = inMeal.find((d) => p.isCandidate[m.state.idIndex.get(d) ?? -1]);
      out.push({
        candidates: candidateIds(m, p),
        ...(component !== undefined && { component }),
        by: id,
        ...(code & 1 ? { unit: false, suppressed: true } : { unit: p.must }),
      });
    }
  };
  visit(s.base, 'base');
  visit(s.curry, 'curry');
  visit(s.subzi, 'subzi');
  for (const id of s.extras) visit(id, 'extra');
  return out;
}

const ROLE_INDEX: Record<Role, number> = Object.fromEntries(ROLES.map((r, i) => [r, i])) as Record<Role, number>;

/**
 * Score a plan. With `justify`, also explain every hard and soft violation (slower; used for
 * reporting, not inside the search loop).
 */
export function score(m: CompiledModel, plan: PlanState, justify = false): ScoreResult {
  const st = m.state;
  const { bufCi, bufSlot, bufMemo, bufFlag, counts, pairs, pairState, bufPairs, pairBy, pairUnit } = st;
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
    bufFlag[n] = 0;
    n++;
  };

  /** The first assignment in [start, end) holding a candidate of `p`, or -1. */
  const present = (p: CompiledPair, start: number, end: number): number => {
    for (let k = start; k < end; k++) if (p.isCandidate[bufCi[k]]) return k;
    return -1;
  };

  // Pairs triggered in one meal (assignments [start, end)): flag the sides they bring and score the
  // missing ones. A pair triggered by several dishes is enforced if any of them enforces it.
  const pairSlot = (slot: number, start: number, end: number) => {
    let np = 0;
    for (let i = start; i < end; i++) {
      for (const code of bufMemo[i].pairs) {
        const pk = code >> 1;
        if (!pairState[pk]) {
          bufPairs[np++] = pk;
          pairBy[pk] = bufCi[i];
        }
        const v = code & 1 ? 1 : 2;
        if (v > pairState[pk]) pairState[pk] = v;
      }
    }
    // Unit members first: the curry or subzi role a unit member holds is taken, so a missing pair
    // (of any strength, from any dish in the meal) for that role is suppressed rather than charged.
    let unitRoles = 0;
    for (let q = 0; q < np; q++) {
      const pk = bufPairs[q];
      const p = pairs[pk];
      if (!p.must || pairState[pk] !== 2) continue;
      const k = present(p, start, end);
      if (k >= 0) {
        bufFlag[k] |= ASKED | UNIT;
        unitRoles |= p.roleBit;
        pairUnit[pk] = 1;
      }
    }
    // A missing pair gives way to a unit member holding its role only when no unit pair for that role
    // shares a candidate with it: a shared candidate would meet both, so the gap is charged.
    const yieldsToUnit = (p: CompiledPair): boolean => {
      if (!(p.roleBit & unitRoles)) return false;
      for (let q = 0; q < np; q++) {
        const u = pairs[bufPairs[q]];
        if (pairUnit[bufPairs[q]] && u.roleBit === p.roleBit && sharesCandidate(u, p)) return false;
      }
      return true;
    };
    // For explanations: which enforced pair holds each role, a unit member present first, then any
    // `must`, then any other. Worked out before the loop below clears the pair states.
    let holders: [number, number] | undefined;
    if (justify) {
      holders = [-1, -1];
      const rank = [0, 0];
      for (let q = 0; q < np; q++) {
        const pk = bufPairs[q];
        const p = pairs[pk];
        if (!p.roleBit || pairState[pk] !== 2) continue;
        const r = p.must ? (p.roleBit & unitRoles && present(p, start, end) >= 0 ? 3 : 2) : 1;
        const h = p.roleBit === ROLE_CURRY ? 0 : 1;
        if (r > rank[h]) { rank[h] = r; holders[h] = pk; }
      }
    }
    for (let q = 0; q < np; q++) {
      const pk = bufPairs[q];
      const p = pairs[pk];
      let enforced = pairState[pk] === 2;
      pairState[pk] = 0;
      const k = present(p, start, end);
      if (k >= 0) {
        if (enforced) bufFlag[k] |= ASKED;
        continue;
      }
      if (yieldsToUnit(p)) enforced = false;
      if (enforced && p.must) hard += 1;
      else if (enforced) soft += p.cost;
      if (justify) {
        const level = enforced && p.must ? 'hard' : 'soft';
        const cost = enforced ? (p.must ? 1 : p.cost) : 0;
        let suppressed: Justification['suppressed'];
        if (!enforced && p.roleBit) {
          const holder = holders![p.roleBit === ROLE_CURRY ? 0 : 1];
          const held = holder >= 0 && !sharesCandidate(pairs[holder], p) ? pairs[holder] : undefined;
          // The holder's candidate in the meal, else its first.
          const heldAt = held ? present(held, start, end) : -1;
          suppressed = {
            by: m.library[pairBy[pk]].id, role: p.roleBit === ROLE_CURRY ? 'curry' : 'subzi',
            ...(held && {
              heldBy: m.library[heldAt >= 0 ? bufCi[heldAt] : held.cis[0]].id, heldMust: held.must, heldWith: m.library[pairBy[holder]].id,
            }),
          };
        }
        just.push({
          constraintId: p.def.id, label: p.def.label, level, origin: p.def.origin, ruleId: p.def.ruleId,
          group: { day: slotDay(slot), meal: slotMeal(slot), componentId: m.library[p.cis[0]].id },
          actual: 0, bound: { kind: level === 'hard' ? 'hardMin' : 'softMin', value: 1 }, units: 1, cost,
          ...(p.cis.length > 1 && { candidates: candidateIds(m, p) }),
          ...(suppressed && { suppressed }),
        });
      }
    }
    for (let q = 0; q < np; q++) pairUnit[bufPairs[q]] = 0;
  };

  for (let slot = 0; slot < plan.length; slot++) {
    const s = plan[slot];
    const start = n;
    if (s.base !== undefined) place(s.base, ROLE_INDEX.base, slot);
    if (s.curry !== undefined) place(s.curry, ROLE_INDEX.curry, slot);
    if (s.subzi !== undefined) place(s.subzi, ROLE_INDEX.subzi, slot);
    for (const id of s.extras) place(id, ROLE_INDEX.extra, slot);
    if (pairs.length && n > start) pairSlot(slot, start, n);
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
    const flag = bufFlag[i];
    soft += memo.prefer + (flag & UNIT ? 0 : memo.preferUnit) + (flag & ASKED ? 0 : memo.preferAsk);
    const slot = bufSlot[i];
    const day = (slot / MEALS.length) | 0;
    const base = flag & UNIT ? plan[slot].base : undefined;
    for (const code of memo.hits) {
      const cc = counts[code >> 2];
      let selected = (code & 1) !== 0;
      let triggers = (code & 2) !== 0;
      if (flag) {
        // Rules that give way skip unit members (and asked-for sides, for 'ask'); a unit member does
        // not trigger its own base's rules.
        if (selected && (flag & UNIT ? cc.yields : cc.yields === YIELD_ASK)) selected = false;
        if (triggers && cc.owner === base) triggers = false;
        if (!selected && !triggers) continue;
      }
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
