// Scores a whole plan against COUNT, PREFER and PAIR constraints. The score is lexicographic:
// any hard violation outweighs every soft cost. Each violated group can be justified.
// Sides a meal's dishes bring by PAIR constraints (unit members and asked-for sides) are worked out
// per meal first; rules on the `dish` or `frequency` level give way to them.
import { byComponent, timeOf, type Constraint, type CountConstraint, type RuleLevel, type Origin, type PairConstraint } from './constraints';
import { compileMatcher, isLeaf, type MatchFn } from './matcher';
import {
  DAYS, MEALS, ROLES, SLOT_COUNT, slotDay, slotMeal, titleCase,
  type Assignment, type ComponentLike, type Day, type Meal, type PlanState, type Role, type SlotState,
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
   * Set on a pairing that is not enforced in this meal because another pairing holds its part, a part that
   * holds one dish (see `capped`): `by` triggered it; `part` is the part's id; `heldBy`, if known, holds the
   * part by a pairing on `heldWith`.
   */
  suppressed?: { by: number; part: number; heldBy?: number; heldMust?: boolean; heldWith?: number };
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
  /** 0 = never gives way, else GIVES_TO_ALWAYS or GIVES_TO_ANY. */
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
  /** Index in `ScoringState.capParts` of the first candidate's part when that part holds one dish (the part the pair claims), else -1. */
  claim: number;
  must: boolean;
  cost: number;
  inScope: Uint8Array;
  /** Matcher indices of the meal-level condition: each must be met by another dish in the meal. Empty: unconditional. */
  inMeal: Int32Array;
}

/**
 * One pairing a placed dish brings: the meal should hold one of `of` (ids in library order). `cond` marks a
 * pairing that waits for a curry or subzi in the meal (met here).
 */
export interface Want { of: readonly number[]; unit: boolean; cond?: true }

/** What placing one dish brings, after conflict resolution. */
export interface Brings { wants: Want[] }

/** One dish's pairs as resolved in a meal (codes like `Memo.pairs`), and what they bring. */
interface Resolved { codes: Int32Array; brings?: Brings }

/** Cached matcher results for one (component, role, slot). */
interface Memo {
  /** Prefer weights split by whom they give way to. */
  prefer: number;
  preferUnit: number;
  preferAsk: number;
  /** Count constraints this assignment touches: (index << 2) | 1 if selected | 2 if it triggers `when`. */
  hits: Int32Array;
  /** Unconditional pairs this assignment triggers, in constraint order: (index << 1) | 1 if suppressed by a conflict. */
  pairs: Int32Array;
  /** Conditional pairs this assignment triggers (indices, constraint order); they hold only where the meal meets them. */
  cond: Int32Array;
  /** Matcher indices of pair conditions that this assignment meets for another dish in its meal. */
  meets: Int32Array;
  /** Per set of met conditional pairs (bit k for `cond[k]`): the pairs as resolved in such a meal, and what they bring. */
  byMet?: Map<number, Resolved>;
  /** The dish's own rules that forbid this assignment and give way only to a unit member (days, meals, never-auto). */
  overrides: number;
  brings?: Brings;
}

/** Flags of an assignment in its meal. Every unit member is also asked for. */
const ASKED = 1;
const UNIT = 2;
/** With `ignoreConditional`: brought by a met conditional pair (such a pair sets this instead of ASKED and UNIT). */
const COND = 4;
/** What a rule gives way to: sides brought by a `must` pair (a dish-level rule), or by any pair (a frequency rule). */
const GIVES_TO_ALWAYS = 1;
const GIVES_TO_ANY = 2;
const givesWay = (l: RuleLevel | undefined): number => (l === 'dish' ? GIVES_TO_ALWAYS : l === 'frequency' ? GIVES_TO_ANY : 0);

export interface CompiledModel {
  readonly library: readonly ComponentLike[];
  readonly byId: ReadonlyMap<number, ComponentLike>;
  readonly constraints: readonly Constraint[];
  /** Internal, mutable scoring state. A model must not be scored concurrently. */
  readonly state: ScoringState;
}

interface ScoringState {
  idIndex: Map<number, number>;
  /** The parts that hold one dish, in the order their caps come; a pair's `claim` indexes it. */
  capParts: readonly number[];
  /** The same parts as a set (`capped`). */
  capped: ReadonlySet<number>;
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
  /** Every matcher index used by a pair's meal-level condition. */
  condMatchers: Int32Array;
  /** Per matcher, while one slot is scored: how many of its assignments meet it (condition matchers only). */
  condCount: Int32Array;
  /** Per library index: 1 if a free pick of the dish can be charged a hard limit (`freePickLimited`), 0 if not, -1 not yet known. */
  freeLimited: Int8Array;
}

const NO_PAIRS = new Int32Array(0);
/** Most conditional pairs of one dish whose resolutions are cached by met set (a bit mask); beyond, uncached. */
const MAX_COND = 30;

/** Built-in id reported for plan entries that reference a component missing from the library. */
export const UNKNOWN_COMPONENT = 'builtin:unknown-component';
const MAX_ASSIGNMENTS = SLOT_COUNT * 16;

/**
 * The part a count constraint caps at one dish per meal, or undefined: a hard maximum of 1 per meal, in every
 * meal (no scope, no trigger), over exactly one part (`is('part', id)` or `oneOf` of one id, alone or as the
 * only member of an `all`, as a per-meal `limit` rule compiles).
 */
function cappedPart(c: CountConstraint): number | undefined {
  if (c.groupBy !== 'slot' || c.scope || c.when || c.bounds.hardMax !== 1) return undefined;
  const m = 'all' in c.select && c.select.all.length === 1 ? c.select.all[0] : c.select;
  if (!isLeaf(m) || m.field !== 'part') return undefined;
  if (m.op === 'eq' && typeof m.value === 'number') return m.value;
  if (m.op === 'in' && Array.isArray(m.value) && m.value.length === 1 && typeof m.value[0] === 'number') return m.value[0];
  return undefined;
}

/** The parts that hold one dish in a meal: those a constraint caps at one per meal. A pair claims such a part. */
export const capped = (m: CompiledModel): ReadonlySet<number> => m.state.capped;

export function compileModel(library: readonly ComponentLike[], constraints: readonly Constraint[]): CompiledModel {
  // Before the pairs, which claim these parts: the caps are usually the last rules.
  const capParts: number[] = [];
  for (const c of constraints) {
    const part = c.kind === 'count' ? cappedPart(c) : undefined;
    if (part !== undefined && !capParts.includes(part)) capParts.push(part);
  }
  const matchers: MatchFn[] = [];
  const addMatcher = (fn: MatchFn) => matchers.push(fn) - 1;
  const counts: CompiledCount[] = [];
  const prefers: { idx: number; weight: number; yields: number }[] = [];
  const pairs: CompiledPair[] = [];
  const N = library.length;
  const idIndex = new Map(library.map((c, i) => [c.id, i]));

  for (const c of constraints) {
    if (c.kind === 'prefer') {
      prefers.push({ idx: addMatcher(compileMatcher(c.select)), weight: c.weight, yields: givesWay(c.level) });
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
        claim: cis.length ? capParts.indexOf(library[cis[0]].part_id ?? NaN) : -1,
        must: c.strength === 'must', cost: c.cost ?? 10, inScope,
        inMeal: Int32Array.from((c.inMeal ?? []).map((mt) => addMatcher(compileMatcher(mt)))),
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
      yields: givesWay(c.level), owner: c.owner ?? NaN,
    });
  }

  // A softer pairing gives way where the sides' own rules forbid every candidate (their "never planned
  // automatically", days or meals): there it is not enforced, so no side is brought or missed. Only
  // `must` pairs make the sides' own rules give way.
  for (const p of pairs) {
    if (p.must || !p.cis.length) continue;
    const sides = Array.from(p.cis, (ci) => {
      const side = library[ci];
      return { side, own: counts.filter((cc) => cc.owner === side.id && cc.hardMax === 0 && cc.when < 0 && cc.yields !== GIVES_TO_ANY) };
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
      capParts, capped: new Set(capParts),
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
      condMatchers: Int32Array.from(new Set(pairs.flatMap((p) => Array.from(p.inMeal)))),
      condCount: new Int32Array(matchers.length),
      freeLimited: new Int8Array(N).fill(-1),
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
      if (bits[cc.sel] && cc.owner === a.c.id && cc.hardMax === 0 && cc.when < 0 && cc.yields === GIVES_TO_ALWAYS && groupInScope(cc, slot)) overrides++;
    });
    // Pairs this dish triggers (not those it is a candidate of). Conditional pairs depend on the rest of
    // the meal, so they are resolved where the meal is known (`resolvePairs`). For the others: a capped part
    // holds one dish, so the first pair to claim it wins, `must` pairs before `prefer` ones, each in
    // constraint order; a later pair for the same part is suppressed when it shares no candidate with the
    // first. Pairs for a part that holds many dishes (extras) never conflict.
    const triggered: number[] = [];
    const cond: number[] = [];
    st.pairs.forEach((p, pk) => {
      if (p.cis.length && p.inScope[slot] && bits[p.when] && !p.isCandidate[ci]) (p.inMeal.length ? cond : triggered).push(pk);
    });
    const suppressed = claimParts(st.pairs, triggered);
    const pairs = triggered.map((pk) => (pk << 1) | +suppressed.has(pk));
    const meets = Array.from(st.condMatchers).filter((mk) => bits[mk]);
    e = st.memo[key] = {
      prefer: prefer[0], preferUnit: prefer[GIVES_TO_ALWAYS], preferAsk: prefer[GIVES_TO_ANY],
      hits: Int32Array.from(hits), pairs: pairs.length ? Int32Array.from(pairs) : NO_PAIRS, overrides,
      cond: cond.length ? Int32Array.from(cond) : NO_PAIRS, meets: meets.length ? Int32Array.from(meets) : NO_PAIRS,
    };
  }
  return e;
}

const sharesCandidate = (a: CompiledPair, b: CompiledPair): boolean => {
  for (const ci of b.cis) if (a.isCandidate[ci]) return true;
  return false;
};

/**
 * Which of one dish's pairs (`pks`, constraint order) lose their part: the first pair to claim a capped part
 * wins, `must` pairs before `prefer` ones; a later pair for the same part is suppressed when it shares no
 * candidate with the first. Returns the suppressed pairs and, in `claimedBy`, each claimed part's first (by `claim`).
 */
function claimParts(pairs: readonly CompiledPair[], pks: Iterable<number>, claimedBy = new Map<number, CompiledPair>()): Set<number> {
  const suppressed = new Set<number>();
  for (const must of [true, false]) {
    for (const pk of pks) {
      const p = pairs[pk];
      if (p.must !== must || p.claim < 0) continue;
      const first = claimedBy.get(p.claim);
      if (first === undefined) claimedBy.set(p.claim, p);
      else if (!sharesCandidate(first, p)) suppressed.add(pk);
    }
  }
  return suppressed;
}

/**
 * One dish's pairs in its meal, as codes like `Memo.pairs`: the unconditional pairs, then the conditional
 * pairs whose condition the meal meets (every matcher met by another dish; `met(mk)` says whether one meets
 * matcher `mk`). A met conditional pair claims its part first (conditional pairs among themselves as in
 * `claimParts`) and suppresses the dish's unconditional pairs for that part that share no candidate with it,
 * whatever their rule ids or strengths. Unmet conditional pairs are left out. Cached per set of met pairs.
 */
function resolvePairs(st: ScoringState, memo: Memo, met: (mk: number) => boolean): Resolved {
  const n = memo.cond.length;
  const condMet = (k: number) => st.pairs[memo.cond[k]].inMeal.every(met);
  if (n > MAX_COND) return resolveWith(st, memo, condMet);
  let mask = 0;
  for (let k = 0; k < n; k++) if (condMet(k)) mask |= 1 << k;
  const byMet = (memo.byMet ??= new Map());
  let r = byMet.get(mask);
  if (!r) byMet.set(mask, (r = mask ? resolveWith(st, memo, (k) => (mask & (1 << k)) !== 0) : { codes: memo.pairs }));
  return r;
}

function resolveWith(st: ScoringState, memo: Memo, condMet: (k: number) => boolean): Resolved {
  const met: number[] = [];
  for (let k = 0; k < memo.cond.length; k++) if (condMet(k)) met.push(memo.cond[k]);
  if (!met.length) return { codes: memo.pairs };
  const claimedBy = new Map<number, CompiledPair>();
  const condSuppressed = claimParts(st.pairs, met, claimedBy);
  const codes: number[] = [];
  for (const code of memo.pairs) {
    const p = st.pairs[code >> 1];
    const holder = p.claim >= 0 ? claimedBy.get(p.claim) : undefined;
    codes.push(holder && !sharesCandidate(holder, p) ? code | 1 : code);
  }
  for (const pk of met) codes.push((pk << 1) | +condSuppressed.has(pk));
  return { codes: Int32Array.from(codes) };
}

/** What pair codes bring: one want per enforced pair, `unit` for `must` pairs. */
const bringsOf = (m: CompiledModel, codes: Int32Array): Brings => {
  const wants: Want[] = [];
  for (const code of codes) {
    if (code & 1) continue;
    const p = m.state.pairs[code >> 1];
    wants.push({ of: candidateIds(m, p), unit: p.must, ...(p.inMeal.length > 0 && { cond: true as const }) });
  }
  return { wants };
};

/** The memo of each dish in meal `s` at `slot`, with its role; dishes missing from the library are left out. */
function mealMemos(m: CompiledModel, s: SlotState, slot: number): { id: number; role: Role; memo: Memo }[] {
  const out: { id: number; role: Role; memo: Memo }[] = [];
  const add = (id: number | undefined, role: Role) => {
    if (id === undefined) return;
    const ci = m.state.idIndex.get(id);
    if (ci !== undefined) out.push({ id, role, memo: memoFor(m, ci, ROLE_INDEX[role], slot) });
  };
  add(s.base, 'base');
  add(s.curry, 'curry');
  add(s.subzi, 'subzi');
  for (const id of s.extras) add(id, 'extra');
  return out;
}

/** `memo`'s pairs resolved in a meal of `others` (the meal's other dishes). */
const resolveIn = (st: ScoringState, memo: Memo, others: readonly { memo: Memo }[]): Resolved =>
  memo.cond.length ? resolvePairs(st, memo, (mk) => others.some((o) => o.memo.meets.includes(mk))) : { codes: memo.pairs };

const candidateIds = (m: CompiledModel, p: CompiledPair): number[] => Array.from(p.cis, (ci) => m.library[ci].id);

/**
 * What placing `id` in `role` at `slot` brings, after conflict resolution: one want per enforced pair,
 * `unit` for `must` pairs. Pairs that wait for a curry or subzi in the meal are left out (see `mealBrings`).
 * Memoised.
 */
export function bringsWith(m: CompiledModel, id: number, role: Role, slot: number): Brings {
  const ci = m.state.idIndex.get(id);
  if (ci === undefined) return { wants: [] };
  const memo = memoFor(m, ci, ROLE_INDEX[role], slot);
  return (memo.brings ??= bringsOf(m, memo.pairs));
}

/**
 * Whether some dish of meal `s` at `slot` has a pair that waits for a curry or subzi (met or not). Where none
 * does, what each dish brings does not depend on the rest of the meal. Memoised per dish.
 */
export function mealHasConditional(m: CompiledModel, s: SlotState, slot: number): boolean {
  const has = (id: number | undefined, role: Role) => {
    const ci = id === undefined ? undefined : m.state.idIndex.get(id);
    return ci !== undefined && memoFor(m, ci, ROLE_INDEX[role], slot).cond.length > 0;
  };
  return has(s.base, 'base') || has(s.curry, 'curry') || has(s.subzi, 'subzi') || s.extras.some((e) => has(e, 'extra'));
}

/**
 * What `id` in `role` brings to meal `s` at `slot`: as `bringsWith`, but a pair that waits for a curry or
 * subzi is a want where every part of its condition is met by another dish of `s`, and there it takes its
 * role from the dish's other pairs (see `resolvePairs`). The same object for the same met conditions.
 */
export function mealBrings(m: CompiledModel, s: SlotState, slot: number, id: number, role: Role): Brings {
  const ci = m.state.idIndex.get(id);
  if (ci === undefined) return { wants: [] };
  const memo = memoFor(m, ci, ROLE_INDEX[role], slot);
  if (!memo.cond.length) return (memo.brings ??= bringsOf(m, memo.pairs));
  const meal = mealMemos(m, s, slot);
  const self = meal.findIndex((d) => d.id === id && d.role === role);
  const r = resolveIn(m.state, memo, self < 0 ? meal : meal.filter((_, k) => k !== self));
  return (r.brings ??= bringsOf(m, r.codes));
}

/**
 * Whether scoring `id` as a free pick (`ScoreOptions.freePick`) can add hard violations: some count rule that
 * gives way to asked sides and has a hard maximum selects the dish in some role and slot. When none does, the
 * free pick's hard score equals the plain one. Memoised per dish.
 */
export function freePickLimited(m: CompiledModel, id: number): boolean {
  const st = m.state;
  const ci = st.idIndex.get(id);
  if (ci === undefined) return false;
  if (st.freeLimited[ci] < 0) {
    const c = m.library[ci];
    const limits = st.counts.filter((cc) => cc.yields === GIVES_TO_ANY && cc.hardMax !== Infinity);
    let hit = false;
    for (let r = 0; r < ROLES.length && !hit; r++) {
      for (let slot = 0; slot < SLOT_COUNT && !hit; slot++) {
        const a: Assignment = { c, role: ROLES[r], day: slotDay(slot), meal: slotMeal(slot) };
        hit = limits.some((cc) => st.matchers[cc.sel](a));
      }
    }
    st.freeLimited[ci] = +hit;
  }
  return st.freeLimited[ci] === 1;
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
 * The summed weight of the prefer rules that match `id` in `role` at `slot` and give way to a brought dish
 * (a unit member or an asked-for side): what the score leaves out when the dish is brought. By default
 * "Prefer frequent dishes", "Avoid rare dishes" and "Curries, subzis and extras only when a rule asks". Memoised.
 */
export function yieldedPreferWeight(m: CompiledModel, id: number, role: Role, slot: number): number {
  const ci = m.state.idIndex.get(id);
  if (ci === undefined) return 0;
  const memo = memoFor(m, ci, ROLE_INDEX[role], slot);
  return memo.preferUnit + memo.preferAsk;
}

/**
 * The pull of a lock toward a conditional link's curry or subzi in meal `slot`: for each pair waiting for a
 * curry or subzi that the meal's base triggers and that brings one of `locked` (the meal's locked extras and
 * locked subzi), the pair's cost when any part of its condition is unmet by the meal's other dishes, else 0.
 * With several parts the cost is charged once, so it pulls toward a meal meeting every part. The only path by
 * which a conditional link moves the curry; the solver adds it to the search's score, never the reported one.
 */
export function lockNudge(m: CompiledModel, plan: PlanState, slot: number, locked: readonly number[]): number {
  const s = plan[slot];
  if (s.base === undefined || !locked.length) return 0;
  const st = m.state;
  const ci = st.idIndex.get(s.base);
  if (ci === undefined) return 0;
  const { cond } = memoFor(m, ci, ROLE_INDEX.base, slot);
  if (!cond.length) return 0;
  const others = mealMemos(m, s, slot).filter((d) => d.role !== 'base');
  let cost = 0;
  for (const pk of cond) {
    const p = st.pairs[pk];
    if (!locked.some((id) => p.isCandidate[st.idIndex.get(id) ?? -1])) continue;
    if (!p.inMeal.every((mk) => others.some((o) => o.memo.meets.includes(mk)))) cost += p.cost;
  }
  return cost;
}

export interface SlotPair {
  /** The dishes that meet the pairing, in library order. */
  candidates: number[];
  /** The candidate present in the meal, if any. */
  component?: number;
  /** Id of the dish whose pairing brings it. */
  by: number;
  /** The rule that makes the pairing, when it came from a stored rule. */
  ruleId?: number;
  /** Brought by a `must` pair that is enforced. */
  unit: boolean;
  /** Not enforced because another pair from the same dish claims the same part (one that holds one dish). */
  suppressed?: boolean;
}

/** The pairings triggered in one meal, whether or not the side is there. */
export function slotPairs(m: CompiledModel, plan: PlanState, slot: number): SlotPair[] {
  const out: SlotPair[] = [];
  const s = plan[slot];
  const inMeal = [s.base, s.curry, s.subzi, ...s.extras].filter((d): d is number => d !== undefined);
  const meal = mealMemos(m, s, slot);
  meal.forEach(({ id, memo }, k) => {
    for (const code of resolveIn(m.state, memo, meal.filter((_, j) => j !== k)).codes) {
      const p = m.state.pairs[code >> 1];
      const component = inMeal.find((d) => p.isCandidate[m.state.idIndex.get(d) ?? -1]);
      out.push({
        candidates: candidateIds(m, p),
        ...(component !== undefined && { component }),
        by: id,
        ...(p.def.ruleId !== undefined && { ruleId: p.def.ruleId }),
        ...(code & 1 ? { unit: false, suppressed: true } : { unit: p.must }),
      });
    }
  });
  return out;
}

const ROLE_INDEX: Record<Role, number> = Object.fromEntries(ROLES.map((r, i) => [r, i])) as Record<Role, number>;

export interface ScoreOptions {
  /**
   * Score every assignment of `id` in the plan as a free pick for its frequency count rules (the count
   * rules that give way to asked sides): they are charged to it, and a weekly limit sees the dish's other
   * brought meals too. Its prefer rules and its other count rules (its days and meals) still give way.
   * Used to rank a link's candidates.
   */
  freePick?: { id: number };
  /**
   * Score as if no pair waiting for a curry or subzi existed: a dish in a meal only because such a pair
   * brought it is left out of every count rule with an upper bound, of the `when` of every count rule and of
   * every prefer rule (it still counts toward a minimum, such as "a subzi at every meal", and still holds
   * its role, so the plain pairs it took the role from stay suppressed), and a missing conditional pair
   * costs nothing. The search judges a curry with it, so what a conditional pair brings never moves the curry.
   */
  ignoreConditional?: boolean;
}

/**
 * Score a plan. With `justify`, also explain every hard and soft violation (slower; used for
 * reporting, not inside the search loop).
 */
export function score(m: CompiledModel, plan: PlanState, justify = false, opts: ScoreOptions = {}): ScoreResult {
  /** The free pick's library index, or -1. */
  const freeCi = opts.freePick ? (m.state.idIndex.get(opts.freePick.id) ?? -1) : -1;
  const ignoreCond = !!opts.ignoreConditional;
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
    // Conditional pairs: how many of the meal's assignments meet each condition matcher.
    const { condCount } = st;
    if (st.condMatchers.length) for (let i = start; i < end; i++) for (const mk of bufMemo[i].meets) condCount[mk]++;
    for (let i = start; i < end; i++) {
      const memo = bufMemo[i];
      // Met by a dish other than assignment i.
      const codes = memo.cond.length
        ? resolvePairs(st, memo, (mk) => condCount[mk] - +memo.meets.includes(mk) > 0).codes
        : memo.pairs;
      for (const code of codes) {
        const pk = code >> 1;
        if (!pairState[pk]) {
          bufPairs[np++] = pk;
          pairBy[pk] = bufCi[i];
        }
        const v = code & 1 ? 1 : 2;
        if (v > pairState[pk]) pairState[pk] = v;
      }
    }
    // Unit members first: the capped part a unit member holds is taken, so a missing pair (of any
    // strength, from any dish in the meal) for that part is suppressed rather than charged.
    for (let q = 0; q < np; q++) {
      const pk = bufPairs[q];
      const p = pairs[pk];
      if (!p.must || pairState[pk] !== 2) continue;
      const k = present(p, start, end);
      if (k >= 0) {
        bufFlag[k] |= ignoreCond && p.inMeal.length ? COND : ASKED | UNIT;
        pairUnit[pk] = 1;
      }
    }
    /** Whether a unit member holds capped part `claim`. */
    const unitHolds = (claim: number): boolean => {
      for (let q = 0; q < np; q++) if (pairUnit[bufPairs[q]] && pairs[bufPairs[q]].claim === claim) return true;
      return false;
    };
    // A missing pair gives way to a unit member holding its part only when no unit pair for that part
    // shares a candidate with it: a shared candidate would meet both, so the gap is charged.
    const yieldsToUnit = (p: CompiledPair): boolean => {
      if (p.claim < 0) return false;
      let held = false;
      for (let q = 0; q < np; q++) {
        const u = pairs[bufPairs[q]];
        if (!pairUnit[bufPairs[q]] || u.claim !== p.claim) continue;
        if (sharesCandidate(u, p)) return false;
        held = true;
      }
      return held;
    };
    // For explanations: which enforced pair holds each capped part (by `claim`), a unit member present
    // first, then any `must`, then any other. Worked out before the loop below clears the pair states.
    let holders: number[] | undefined;
    if (justify) {
      holders = st.capParts.map(() => -1);
      const rank = st.capParts.map(() => 0);
      for (let q = 0; q < np; q++) {
        const pk = bufPairs[q];
        const p = pairs[pk];
        if (p.claim < 0 || pairState[pk] !== 2) continue;
        const r = p.must ? (unitHolds(p.claim) && present(p, start, end) >= 0 ? 3 : 2) : 1;
        if (r > rank[p.claim]) { rank[p.claim] = r; holders[p.claim] = pk; }
      }
    }
    for (let q = 0; q < np; q++) {
      const pk = bufPairs[q];
      const p = pairs[pk];
      let enforced = pairState[pk] === 2;
      pairState[pk] = 0;
      const k = present(p, start, end);
      if (k >= 0) {
        if (enforced) bufFlag[k] |= ignoreCond && p.inMeal.length ? COND : ASKED;
        continue;
      }
      // A missing conditional pair is never hard: it gives way to whatever kept its dish out of the meal.
      // Blind to conditional pairs, it costs nothing.
      if (ignoreCond && p.inMeal.length) continue;
      if (yieldsToUnit(p)) enforced = false;
      const isHard = enforced && p.must && !p.inMeal.length;
      if (isHard) hard += 1;
      else if (enforced) soft += p.cost;
      if (justify) {
        const level = isHard ? 'hard' : 'soft';
        const cost = enforced ? (isHard ? 1 : p.cost) : 0;
        let suppressed: Justification['suppressed'];
        if (!enforced && p.claim >= 0) {
          const holder = holders![p.claim];
          const held = holder >= 0 && !sharesCandidate(pairs[holder], p) ? pairs[holder] : undefined;
          // The holder's candidate in the meal, else its first.
          const heldAt = held ? present(held, start, end) : -1;
          suppressed = {
            by: m.library[pairBy[pk]].id, part: st.capParts[p.claim],
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
    if (st.condMatchers.length) for (let i = start; i < end; i++) for (const mk of bufMemo[i].meets) condCount[mk] = 0;
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
    // Brought only by a met conditional pair, scored blind to such pairs: left out (see `ignoreConditional`).
    const ignored = (flag & (COND | ASKED)) === COND;
    if (!ignored) soft += memo.prefer + (flag & UNIT ? 0 : memo.preferUnit) + (flag & ASKED ? 0 : memo.preferAsk);
    // The free pick is charged its frequency count rules (those that give way to asked sides). Its prefer
    // rules still give way: they rank a link's candidates through the solver's `candidateWeight`, which
    // charging them here would count twice. Its other rules (days, meals) give way as usual.
    const free = bufCi[i] === freeCi;
    const slot = bufSlot[i];
    const day = (slot / MEALS.length) | 0;
    const base = flag & UNIT ? plan[slot].base : undefined;
    for (const code of memo.hits) {
      const cc = counts[code >> 2];
      let selected = (code & 1) !== 0;
      let triggers = (code & 2) !== 0;
      if (ignored) {
        if (!selected || cc.hardMax !== Infinity || cc.softMax !== Infinity) continue;
        triggers = false;
      } else if (flag) {
        // Rules that give way skip unit members (and asked-for sides, for 'ask'); a unit member does
        // not trigger its own base's rules.
        if (selected && !(free && cc.yields === GIVES_TO_ANY) && (flag & UNIT ? cc.yields : cc.yields === GIVES_TO_ANY)) selected = false;
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
