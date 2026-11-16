// Construct (randomised greedy) then improve (late-acceptance hill climbing).
// Pinned values are placed first and never moved. Moves only ever produce structurally valid
// slots: one base, at most one curry and subzi, each from its own component type, no duplicate extras.
// Placing a dish brings what it is paired with in the same step (`bring`), so a base is always judged
// together with its sides; the sides it must be served with (unit members) are not moved on their own.
import { searchBudget } from './budget';
import { mulberry32 } from './rng';
import { compareScore, freePickLimited, lockNudge, mealBrings, mealHasConditional, ownRulesOverridden, score, yieldedPreferWeight, type Brings, type CompiledModel, type Score, type ScoreResult } from './scorer';
import { DAYS, MEALS, PARTS, SLOT_COUNT, dishesIn, emptyPlan, partOf, withDish, withoutDish, type PartDef, type PlanState, type Pins, type Role, type SlotPins, type SlotState } from './types';

/** The wall-clock cap on a solve when none is given. It only guards against a stuck search; the step budget normally ends it first. */
export const SAFETY_CAP_MS = 10_000;

export interface SolveOptions {
  seed?: number;
  pins?: Pins;
  /** Safety cap on wall-clock time for the whole solve, in ms. Default `SAFETY_CAP_MS`. Not a tuning knob: the step budget decides the result. */
  timeLimitMs?: number;
  /** Cap on local-search iterations. Default `searchBudget(model).maxIterations`. */
  maxIterations?: number;
  /** Stop once no hard violations remain and the best score has not improved for this many iterations. Default `searchBudget(model).plateauIterations`. */
  plateauIterations?: number;
  /** Late-acceptance history length. Default 40. */
  lateAcceptance?: number;
  /** Candidates sampled per role per slot during construction; 0 = all. Default 10. */
  constructionSample?: number;
  /** Softmax temperature over soft score when choosing construction candidates; higher = more variety. Default 1. */
  temperature?: number;
  /** Most rounds of the repair loop after the search. Default `REPAIR_ROUNDS`; tests only. */
  repairRounds?: number;
}

export type StopReason = 'plateau' | 'time' | 'iterations';

export interface SolveResult {
  plan: PlanState;
  score: ScoreResult;
  stats: { iterations: number; improvements: number; constructionMs: number; totalMs: number; stopReason: StopReason; repairRounds: number };
}

type PickRole = 'base' | 'curry' | 'subzi';
const PICK_ROLES: readonly PickRole[] = ['base', 'curry', 'subzi'];
const PIN_KEY = { base: 'base_id', curry: 'curry_id', subzi: 'subzi_id', extras: 'extra_ids' } as const;
const now = (): number => globalThis.performance?.now() ?? Date.now();
const NOTHING: readonly number[] = [];
/** Rounds of `bring`: a brought side may bring its own sides. */
const BRING_ROUNDS = 3;
/** Most rounds of the repair loop after the search; it stops sooner once a round keeps nothing. */
export const REPAIR_ROUNDS = 10;
/** Default `constructionSample`. */
const SAMPLE_SIZE = 10;
/** Bound on `w` in `chooseCandidate`'s weighted use: one candidate is weighted at most 2 × this past another. */
const MAX_WEIGHT = 2;
/** Mixed into the seed for the stream of candidate offsets, kept apart from the search's own `rng`. */
const OFFSET_SEED_MIX = 0x9e3779b9;

/**
 * Which of a want's candidates to bring into slot `slot`: the one with the best score; ties go to the one
 * with the lowest weighted use `(timesPlanned + o) × 2^w`. `w` is `weightOf` (0 when omitted) less the lowest
 * `weightOf` among the scored candidates, at most 2 × MAX_WEIGHT, so a weight every candidate shares changes
 * nothing; a frequent candidate (weight −1) comes about twice as often as a normal one and a rare one (+1)
 * about half as often. `o` in [0, 1) comes from `offsetOf` (0.5 when omitted); the solver
 * draws it per candidate from the seed, so which candidate a week starts with varies with the seed and a
 * candidate with few chances is still planned in some weeks. Remaining ties go to the earlier in the order
 * `candidates[(slot + k) % n]`, so meals in turn start from a different candidate. At most `limit`
 * candidates (0 = all) are scored, taken in that order. Deterministic.
 */
/** Plain `Score`s compare with `compareScore`; a `BroughtScore` does not fit here, so it must use the overload below. */
export function chooseCandidate(
  candidates: readonly number[],
  slot: number,
  scoreWith: (id: number) => Score & { overrides?: never },
  timesPlanned: (id: number) => number,
  limit?: number,
  weightOf?: (id: number) => number,
  offsetOf?: (id: number) => number,
): number;
/** Any other kind of score (a `BroughtScore`, say) has to say how to compare it. */
export function chooseCandidate<S>(
  candidates: readonly number[],
  slot: number,
  scoreWith: (id: number) => S,
  timesPlanned: (id: number) => number,
  limit: number | undefined,
  weightOf: ((id: number) => number) | undefined,
  offsetOf: ((id: number) => number) | undefined,
  compare: (a: S, b: S) => number,
): number;
export function chooseCandidate<S>(
  candidates: readonly number[],
  slot: number,
  scoreWith: (id: number) => S,
  timesPlanned: (id: number) => number,
  limit = SAMPLE_SIZE,
  weightOf: (id: number) => number = () => 0,
  offsetOf: (id: number) => number = () => 0.5,
  compare: (a: S, b: S) => number = compareScore as (a: S, b: S) => number,
): number {
  const n = candidates.length;
  if (n <= 1) return candidates[0];
  const k = limit > 0 && limit < n ? limit : n;
  let lowest = Infinity;
  for (let j = 0; j < k; j++) lowest = Math.min(lowest, weightOf(candidates[(slot + j) % n]));
  const weightedUse = (id: number) => (timesPlanned(id) + offsetOf(id)) * 2 ** Math.min(2 * MAX_WEIGHT, weightOf(id) - lowest);
  let best = candidates[slot % n];
  let bestScore = scoreWith(best);
  let bestUse: number | undefined;
  for (let j = 1; j < k; j++) {
    const id = candidates[(slot + j) % n];
    const s = scoreWith(id);
    const c = compare(s, bestScore);
    if (c > 0) continue;
    if (c === 0) {
      bestUse ??= weightedUse(best);
      const u = weightedUse(id);
      if (u >= bestUse) continue;
      bestUse = u;
    } else {
      bestUse = undefined;
    }
    best = id;
    bestScore = s;
  }
  return best;
}

/**
 * A link candidate's score in tiers: `overrides` (units of the dish's own rules it breaks) outrank `limits`
 * (hard frequency limits that give way to it), which outrank `soft`.
 */
export interface BroughtScore extends Score {
  overrides: number;
  limits: number;
}

/** Orders brought scores by hard, then overrides, then limits, then soft; negative when `a` is better. */
export const compareBrought = (a: BroughtScore, b: BroughtScore): number =>
  a.hard !== b.hard ? a.hard - b.hard : a.overrides !== b.overrides ? a.overrides - b.overrides : a.limits !== b.limits ? a.limits - b.limits : a.soft - b.soft;

/**
 * The weight for `chooseCandidate` at slot `slot`: the prefer rules that match a candidate there but give way
 * to a brought dish, so the score cannot see them ("Prefer frequent dishes", "Avoid rare dishes", a dish's
 * own and hand-written prefer rules). "Curries, subzis and extras only when a rule asks" gives way too and
 * adds the same weight to every candidate of one type (a link's candidates are one type); `chooseCandidate`
 * weighs candidates against the lowest of them, so it cannot change their order.
 */
export function candidateWeight(m: CompiledModel, slot: number): (id: number) => number {
  return (id) => {
    const type = m.byId.get(id)?.componentType;
    return type ? yieldedPreferWeight(m, id, type, slot) : 0;
  };
}

/**
 * How to judge a plan holding `id`, brought into slot `slot`, against the other candidates: its hard score
 * first, then the dish's own rules it overrides there (its days, meals and "never planned automatically",
 * which give way to a unit member and so are not in the score), then its hard frequency limits (count
 * rules that give way to asked sides: the hard units, at least 0, the plan would break were `id` a free
 * pick of those rules in every meal it is in), then its
 * soft score. So a candidate those rules allow wins over one they forbid, and the hard limits that no longer
 * stop a link still rank its pick. Only hard limits rank: the soft score is the plan's own, not the free
 * pick's, since charging soft limits ("Vary dishes across the week") ranked a link away from a frequent dish
 * whenever the search had it elsewhere for a moment, and the frequency prefers already rank the pick
 * through `candidateWeight`. With `blind`, both scores leave out what pairs waiting for a curry or subzi bring
 * or miss (`ignoreConditional`), so such a pair cannot rank the pick of a plain link (Sambar or Rasam).
 */
export function broughtScore(m: CompiledModel, plan: PlanState, slot: number, id: number, blind = false): BroughtScore {
  const s = score(m, plan, false, { ignoreConditional: blind });
  // Only a hard limit that gives way to the pick can make the free pick's hard score differ.
  const f = freePickLimited(m, id) ? score(m, plan, false, { freePick: { id }, ignoreConditional: blind }) : s;
  const type = m.byId.get(id)?.componentType;
  const overrides = type ? ownRulesOverridden(m, id, type, slot) : 0;
  // At least 0: charging the frequency rules can only add hard units, but a net figure is never a credit.
  const limits = Math.max(0, f.hard - s.hard);
  return { hard: s.hard, overrides, limits, soft: s.soft };
}

type Snapshot = Readonly<SlotState>;
const snapshot = (s: SlotState): Snapshot => ({ base: s.base, curry: s.curry, subzi: s.subzi, extras: s.extras });
// Extras arrays are never mutated in place (every change assigns a new array), so a snapshot may share one.
const restore = (s: SlotState, snap: Snapshot) => {
  s.base = snap.base;
  s.curry = snap.curry;
  s.subzi = snap.subzi;
  s.extras = snap.extras;
};

export const clonePlan = (p: PlanState): PlanState => p.map((s) => ({ ...s, extras: [...s.extras] }));

export function solve(m: CompiledModel, opts: SolveOptions = {}): SolveResult {
  const t0 = now();
  const rng = mulberry32(opts.seed ?? 1);
  // Each candidate's offset in `chooseCandidate`, drawn once per solve from its own stream so the search's
  // `rng` sequence is unchanged.
  const offsetRng = mulberry32(((opts.seed ?? 1) ^ OFFSET_SEED_MIX) >>> 0);
  const offsets = new Map<number, number>();
  const offsetOf = (id: number): number => {
    let o = offsets.get(id);
    if (o === undefined) offsets.set(id, (o = offsetRng()));
    return o;
  };
  const deadline = t0 + (opts.timeLimitMs ?? SAFETY_CAP_MS);
  const budget = opts.maxIterations === undefined || opts.plateauIterations === undefined ? searchBudget(m) : undefined;
  const maxIterations = opts.maxIterations ?? budget!.maxIterations;
  const plateau = opts.plateauIterations ?? budget!.plateauIterations;
  const sampleSize = opts.constructionSample ?? SAMPLE_SIZE;
  const temperature = opts.temperature ?? 1;
  /** Whether some pair waits for a curry or subzi in the meal. */
  const hasConditional = m.constraints.some((c) => c.kind === 'pair' && !!c.inMeal?.length);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

  const pool: Record<PickRole | 'extra', number[]> = { base: [], curry: [], subzi: [], extra: [] };
  for (const c of m.library) pool[c.componentType].push(c.id);

  // ── Pins ──
  const pins: SlotPins[] = Array.from(
    { length: SLOT_COUNT },
    (_, i) => opts.pins?.[`${DAYS[Math.floor(i / MEALS.length)]}-${MEALS[i % MEALS.length]}`] ?? {},
  );
  // Meals whose extras or subzi the user locked, with the locked dishes: there a link waiting for a curry or
  // subzi that brings a locked dish pulls the meal toward that curry or subzi (`lockNudge`).
  const locks: { slot: number; ids: readonly number[] }[] = [];
  if (hasConditional) {
    pins.forEach((p, slot) => {
      const ids = [...(p.extra_ids ?? []), ...(p.subzi_id != null ? [p.subzi_id] : [])];
      if (ids.length) locks.push({ slot, ids });
    });
  }
  // The search is blind to what a pair waiting for a curry or subzi brings or misses, so it never moves the
  // curry, except toward the curry or subzi a locked side waits for; `bring` keeps such a side out where it
  // would break a hard rule, and the result is scored normally.
  const evaluate = hasConditional
    ? (p: PlanState): Score => {
      const s = score(m, p, false, { ignoreConditional: true });
      let nudge = 0;
      for (const l of locks) nudge += lockNudge(m, p, l.slot, l.ids);
      return nudge ? { hard: s.hard, soft: s.soft + nudge } : s;
    }
    : (p: PlanState): Score => score(m, p);
  const plan: PlanState = emptyPlan().map((s, i) => {
    const p = pins[i];
    return { base: p.base_id, curry: p.curry_id ?? undefined, subzi: p.subzi_id ?? undefined, extras: p.extra_ids ? [...p.extra_ids] : s.extras };
  });
  const isFree = (i: number, r: PickRole | 'extras') => pins[i][PIN_KEY[r]] === undefined;

  // ── Pairings ──
  const hasPairs = m.constraints.some((c) => c.kind === 'pair');
  /**
   * Every candidate of a dish's wants (asked for), of its unit wants only, and of its wants that wait for a
   * curry or subzi (`cond`) or not (`plain`). Cached per memoised `Brings`.
   */
  const unions = new WeakMap<Brings, Record<'asked' | 'unit' | 'cond' | 'plain', readonly number[]>>();
  const unionsOf = (b: Brings) => {
    let u = unions.get(b);
    if (!u) {
      const sets = { asked: new Set<number>(), unit: new Set<number>(), cond: new Set<number>(), plain: new Set<number>() };
      for (const w of b.wants) {
        for (const c of w.of) {
          sets.asked.add(c);
          if (w.unit) sets.unit.add(c);
          (w.cond ? sets.cond : sets.plain).add(c);
        }
      }
      const list = (x: Set<number>) => (x.size ? [...x] : NOTHING);
      u = { asked: list(sets.asked), unit: list(sets.unit), cond: list(sets.cond), plain: list(sets.plain) };
      unions.set(b, u);
    }
    return u;
  };
  /**
   * What the dish in `role` may bring to meal `s` at slot `i`: the candidates of all its wants, or of its unit
   * wants only. A pair that waits for a curry or subzi counts only where `s` meets it.
   */
  const broughtBy = (s: SlotState, id: number | undefined, role: Role, i: number, unitOnly = false): readonly number[] => {
    if (!hasPairs || id === undefined) return NOTHING;
    const u = unionsOf(mealBrings(m, s, i, id, role));
    return unitOnly ? u.unit : u.asked;
  };
  /**
   * Whether `id` is in slot `i` only because a pair waiting for a curry or subzi brought it: some dish there
   * brings it by such a pair, and none by another pair.
   */
  const condOnly = (s: SlotState, i: number, id: number): boolean => {
    if (!hasConditional || !mealHasConditional(m, s, i)) return false;
    let cond = false;
    const visit = (d: number | undefined, role: Role): boolean => {
      if (d === undefined || d === id) return true;
      const u = unionsOf(mealBrings(m, s, i, d, role));
      if (u.plain.includes(id)) return false;
      if (u.cond.includes(id)) cond = true;
      return true;
    };
    if (!visit(s.base, 'base') || !visit(s.curry, 'curry') || !visit(s.subzi, 'subzi')) return false;
    for (const e of s.extras) if (!visit(e, 'extra')) return false;
    return cond;
  };
  /** Whether a dish of meal `s` at slot `i` has a met pair waiting for a curry or subzi with no candidate in the meal. */
  const missesConditional = (s: SlotState, i: number): boolean => {
    if (!mealHasConditional(m, s, i)) return false;
    const inMeal = (c: number) => s.base === c || s.curry === c || s.subzi === c || s.extras.includes(c);
    const misses = (d: number | undefined, role: Role) =>
      d !== undefined && mealBrings(m, s, i, d, role).wants.some((w) => w.cond && !w.of.some(inMeal));
    return misses(s.base, 'base') || misses(s.curry, 'curry') || misses(s.subzi, 'subzi') || s.extras.some((e) => misses(e, 'extra'));
  };
  /** Whether `id` is in slot `i` as a unit member: another dish there must be served with it. */
  const isUnit = (s: SlotState, i: number, id: number | undefined): boolean => {
    if (!hasPairs || id === undefined) return false;
    const by = (d: number | undefined, role: Role) => d !== undefined && d !== id && broughtBy(s, d, role, i, true).includes(id);
    if (by(s.base, 'base') || by(s.curry, 'curry') || by(s.subzi, 'subzi')) return true;
    for (const e of s.extras) if (by(e, 'extra')) return true;
    return false;
  };
  const timesPlanned = (id: number) =>
    plan.reduce((k, s) => (s.base === id || s.curry === id || s.subzi === id || s.extras.includes(id) ? k + 1 : k), 0);
  /**
   * Every side the dishes of meal `s` bring, read before a change for `bring`'s `gone`: a change to the
   * curry or subzi can take a side away from a dish that stays, when the side came by a pair waiting for
   * that curry or subzi (or a met condition took the side's role from a plain pair). Nothing when no dish of
   * the meal has a pair with a condition, since then only the replaced dish's sides (`prev`) can stop being brought.
   */
  const conditionalSides = (s: SlotState, i: number): readonly number[] => {
    if (!hasConditional || !mealHasConditional(m, s, i)) return NOTHING;
    const out = new Set<number>();
    const add = (id: number | undefined, role: Role) => { for (const c of broughtBy(s, id, role, i)) out.add(c); };
    add(s.base, 'base');
    add(s.curry, 'curry');
    add(s.subzi, 'subzi');
    for (const e of s.extras) add(e, 'extra');
    return out.size ? [...out] : NOTHING;
  };
  /**
   * After a change to slot `i`'s base, curry or subzi, first remove the sides the replaced dish brought
   * (`prev`), and the sides the meal's dishes brought before the change (`gone`, from `conditionalSides`),
   * that no dish in the meal still brings, then, for each want of its dishes with no candidate in
   * the meal, bring one of its candidates into a role that is not pinned and is empty, or that holds a side
   * the replaced dish brought. Among several candidates that fit, `chooseCandidate` picks.
   * Unit members may take such a role; asked-for sides only fill an empty one. Extras are appended.
   * Repeats while anything changes, since a brought side can bring its own. Uses no randomness.
   */
  const bring = (i: number, prev: readonly number[], gone: readonly number[] = NOTHING) => {
    if (!hasPairs) return;
    const s = plan[i];
    let changed = false;
    /** The plan's hard score with meal `i` as these fields hold, for `addsNoHard`. */
    let hardBefore: (Snapshot & { hard: number }) | undefined;
    /** Whether `place(c, unit)` would put `c` in the meal. */
    const fits = (c: number, unit: boolean): boolean => {
      const type = m.byId.get(c)?.componentType;
      if (type === 'extra') return isFree(i, 'extras') && !s.extras.includes(c);
      if (type !== 'curry' && type !== 'subzi') return false;
      const cur = s[type];
      if (cur === c || !isFree(i, type)) return false;
      return cur === undefined || (unit && prev.includes(cur) && !isUnit(s, i, cur));
    };
    const place = (c: number, unit: boolean) => {
      if (!fits(c, unit)) return;
      const type = m.byId.get(c)!.componentType;
      if (type === 'extra') s.extras = [...s.extras, c];
      else s[type as 'curry' | 'subzi'] = c;
      changed = true;
    };
    // A candidate is judged with what it brings in turn (each want's first candidate that fits), so its
    // own pairings do not count against it. With `blind`, it is judged as the search judges a curry: blind
    // to what pairs waiting for a curry or subzi bring or miss.
    const scoreWith = (unit: boolean, blind: boolean) => (c: number): BroughtScore => {
      const before = snapshot(s);
      const was = changed;
      place(c, unit);
      fill(false);
      const result = broughtScore(m, plan, i, c, blind);
      restore(s, before);
      changed = was;
      return result;
    };
    /**
     * Whether placing `c` adds no hard violation to the normal score: a side brought by a pair waiting for a
     * curry or subzi comes only then, and is otherwise left out (the final score reports the missing pair).
     */
    const addsNoHard = (c: number, unit: boolean): boolean => {
      const before = snapshot(s);
      const was = changed;
      // Only this meal changes during a bring, and its extras array is replaced on every change, so the
      // meal's four fields name the plan's state: the hard score before placing is reused while they hold.
      if (!hardBefore || hardBefore.base !== s.base || hardBefore.curry !== s.curry || hardBefore.subzi !== s.subzi || hardBefore.extras !== s.extras) {
        hardBefore = { ...before, hard: score(m, plan).hard };
      }
      const hard = hardBefore.hard;
      place(c, unit);
      const after = score(m, plan).hard;
      restore(s, before);
      changed = was;
      return after <= hard;
    };
    const inMeal = (c: number) => s.base === c || s.curry === c || s.subzi === c || s.extras.includes(c);
    const visit = (id: number | undefined, role: Role, choose: boolean) => {
      if (id === undefined) return;
      for (const w of mealBrings(m, s, i, id, role).wants) {
        if (w.of.some(inMeal)) continue;
        const allowed = (c: number) => fits(c, w.unit) && (!w.cond || addsNoHard(c, w.unit));
        if (w.of.length === 1) {
          if (!w.cond || allowed(w.of[0])) place(w.of[0], w.unit);
          continue;
        }
        const options = w.of.filter(allowed);
        if (!options.length) continue;
        // A plain link's pick (Sambar or Rasam) must not see what a conditional link would bring with it;
        // a conditional link's own candidates (Papad or Murukku) are ranked on the whole meal.
        place(choose ? chooseCandidate(options, i, scoreWith(w.unit, hasConditional && !w.cond), timesPlanned, sampleSize, candidateWeight(m, i), offsetOf, compareBrought) : options[0], w.unit);
      }
    };
    /** Brings each meal dish's missing wants, `BRING_ROUNDS` times at most; `choose` picks among candidates. */
    const fill = (choose: boolean) => {
      for (let round = 0; round < BRING_ROUNDS; round++) {
        changed = false;
        visit(s.base, 'base', choose);
        visit(s.curry, 'curry', choose);
        visit(s.subzi, 'subzi', choose);
        for (const e of s.extras) visit(e, 'extra', choose);
        if (!changed) break;
      }
    };
    // The replaced dish's sides leave with it, unless a dish still in the meal brings them too; so do the
    // sides a dish brought only while the meal met a condition it no longer meets.
    const stillBrought = (c: number) => {
      const by = (d: number | undefined, role: Role) => d !== undefined && d !== c && broughtBy(s, d, role, i).includes(c);
      return by(s.base, 'base') || by(s.curry, 'curry') || by(s.subzi, 'subzi') || s.extras.some((e) => by(e, 'extra'));
    };
    for (const c of gone.length ? both(prev, gone) : prev) {
      const type = m.byId.get(c)?.componentType;
      if (type === 'extra') {
        if (isFree(i, 'extras') && s.extras.includes(c) && !stillBrought(c)) s.extras = s.extras.filter((e) => e !== c);
      } else if ((type === 'curry' || type === 'subzi') && s[type] === c && isFree(i, type) && !stillBrought(c)) {
        s[type] = undefined;
      }
    }
    fill(true);
  };
  /** Sides brought by the dishes in two roles, for `bring`'s `prev`. */
  const both = (a: readonly number[], b: readonly number[]): readonly number[] => (!a.length ? b : !b.length ? a : [...a, ...b]);

  const sample = (ids: readonly number[]): number[] => {
    if (!sampleSize || ids.length <= sampleSize) return [...ids];
    const copy = [...ids];
    for (let i = 0; i < sampleSize; i++) {
      const j = i + Math.floor(rng() * (copy.length - i));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, sampleSize);
  };

  /**
   * Apply each option, keep those with the fewest hard violations, and sample one of them with a
   * softmax over the soft score, so construction favours good choices without always taking the same one.
   */
  const chooseBest = <T>(options: readonly T[], apply: (o: T) => void) => {
    const scored = options.map((o) => {
      apply(o);
      return { o, s: evaluate(plan) };
    });
    const minHard = Math.min(...scored.map((x) => x.s.hard));
    const feasible = scored.filter((x) => x.s.hard === minHard);
    const minSoft = Math.min(...feasible.map((x) => x.s.soft));
    const weights = feasible.map((x) => Math.exp(-(x.s.soft - minSoft) / temperature));
    let r = rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < feasible.length; i++) {
      r -= weights[i];
      if (r <= 0) return apply(feasible[i].o);
    }
    apply(feasible[feasible.length - 1].o);
  };

  // ── Construction ──
  for (let i = 0; i < SLOT_COUNT; i++) {
    const s = plan[i];
    if (isFree(i, 'base') && pool.base.length) {
      // Each base is judged with the sides it brings.
      const before = snapshot(s);
      const prev = broughtBy(s, s.base, 'base', i);
      const gone = conditionalSides(s, i);
      chooseBest(sample(pool.base), (id) => { restore(s, before); s.base = id; bring(i, prev, gone); });
    } else {
      bring(i, NOTHING);
    }
    for (const r of ['curry', 'subzi'] as const) {
      if (!isFree(i, r) || isUnit(s, i, s[r])) continue;
      const before = snapshot(s);
      const prev = broughtBy(s, s[r], r, i);
      const gone = conditionalSides(s, i);
      const options: (number | undefined)[] = [undefined, ...sample(pool[r])];
      // A side already brought (asked for) stays an option.
      if (s[r] !== undefined && !options.includes(s[r])) options.push(s[r]);
      chooseBest(options, (id) => { restore(s, before); s[r] = id; bring(i, prev, gone); });
    }
    if (isFree(i, 'extras')) {
      // Extras are optional: add one only while it strictly improves the score.
      for (;;) {
        const before = s.extras;
        const current = evaluate(plan);
        const improving = sample(pool.extra.filter((e) => !before.includes(e))).filter((id) => {
          s.extras = [...before, id];
          const better = compareScore(evaluate(plan), current) < 0;
          s.extras = before;
          return better;
        });
        if (!improving.length) break;
        chooseBest(improving, (id) => { s.extras = [...before, id]; });
      }
    }
  }
  const constructionMs = now() - t0;

  // ── Local search ──
  const freeSlots = (r: PickRole | 'extras') => Array.from({ length: SLOT_COUNT }, (_, i) => i).filter((i) => isFree(i, r));
  const free = { base: freeSlots('base'), curry: freeSlots('curry'), subzi: freeSlots('subzi'), extras: freeSlots('extras') };
  const L = opts.lateAcceptance ?? 40;
  let current = evaluate(plan);
  let best = current;
  let bestPlan = clonePlan(plan);
  const history: Score[] = new Array(L).fill(current);
  let iterations = 0;
  let improvements = 0;
  let sinceImprovement = 0;
  let stopReason: StopReason = 'iterations';

  while (iterations < maxIterations) {
    if (best.hard === 0 && sinceImprovement >= plateau) { stopReason = 'plateau'; break; }
    if ((iterations & 63) === 0 && now() >= deadline) { stopReason = 'time'; break; }
    iterations++;
    sinceImprovement++;

    // Slots this move changed, as they were before it.
    const undo: { s: SlotState; snap: Snapshot }[] = [];
    const touch = (s: SlotState) => { undo.push({ s, snap: snapshot(s) }); };
    const move = rng();
    if (move < 0.45) {
      // Change (or drop, for optional roles) one role's component. A unit member stays while its dish does.
      const r = pick(PICK_ROLES);
      if (!free[r].length || !pool[r].length) continue;
      const i = pick(free[r]);
      const s = plan[i];
      if (isUnit(s, i, s[r])) continue;
      const v = r !== 'base' && rng() < 0.15 ? undefined : pick(pool[r]);
      const prev = broughtBy(s, s[r], r, i);
      const gone = conditionalSides(s, i);
      touch(s);
      s[r] = v;
      bring(i, prev, gone);
    } else if (move < 0.6) {
      // Change base and curry together, so pairings that depend on the base stay reachable. The base's
      // sides come first; the new curry takes the role only if they leave it empty.
      const slots = free.base.filter((i) => isFree(i, 'curry'));
      if (!slots.length || !pool.base.length) continue;
      const i = pick(slots);
      const s = plan[i];
      const base = pick(pool.base);
      const curry = pool.curry.length ? pick(pool.curry) : undefined;
      const prev = both(broughtBy(s, s.base, 'base', i), broughtBy(s, s.curry, 'curry', i));
      const gone = conditionalSides(s, i);
      touch(s);
      s.curry = undefined;
      s.base = base;
      bring(i, prev, gone);
      if (s.curry === undefined && curry !== undefined) {
        s.curry = curry;
        bring(i, NOTHING);
      }
    } else if (move < 0.8) {
      // Swap the same role between two slots. Unit members stay with their dish.
      const r = pick(PICK_ROLES);
      if (free[r].length < 2) continue;
      const ia = pick(free[r]);
      const ib = pick(free[r]);
      const a = plan[ia];
      const b = plan[ib];
      if (a === b || a[r] === b[r] || isUnit(a, ia, a[r]) || isUnit(b, ib, b[r])) continue;
      const va = a[r];
      const prevA = broughtBy(a, va, r, ia);
      const prevB = broughtBy(b, b[r], r, ib);
      const goneA = conditionalSides(a, ia);
      const goneB = conditionalSides(b, ib);
      touch(a);
      touch(b);
      a[r] = b[r];
      b[r] = va;
      bring(ia, prevA, goneA);
      bring(ib, prevB, goneB);
    } else {
      // Add or remove one extra. A unit member stays while its dish does.
      if (!free.extras.length || !pool.extra.length) continue;
      const withExtras = free.extras.filter((i) => plan[i].extras.length > 0);
      const remove = withExtras.length > 0 && rng() < 0.5;
      const i = pick(remove ? withExtras : free.extras);
      const s = plan[i];
      const old = s.extras;
      if (remove) {
        const k = Math.floor(rng() * old.length);
        // Nor does a side a pair waiting for the meal's curry or subzi brought: the search does not see it.
        if (isUnit(s, i, old[k]) || condOnly(s, i, old[k])) continue;
        s.extras = old.filter((_, j) => j !== k);
      } else {
        const e = pick(pool.extra);
        if (old.includes(e)) continue;
        s.extras = [...old, e];
      }
      undo.push({ s, snap: { ...snapshot(s), extras: old } });
    }

    const candidate = evaluate(plan);
    const h = iterations % L;
    if (compareScore(candidate, current) <= 0 || compareScore(candidate, history[h]) <= 0) {
      current = candidate;
      if (compareScore(current, best) < 0) {
        best = current;
        bestPlan = clonePlan(plan);
        improvements++;
        sinceImprovement = 0;
      }
    } else {
      for (let k = undo.length - 1; k >= 0; k--) restore(undo[k].s, undo[k].snap);
    }
    history[h] = current;
  }

  // ── Repair after the search ──
  // One loop of move kinds (`repair` below). A move kind's `runMeal(i)` tries its changes in meal `i`, keeps
  // those its `accept` allows, and says whether any was kept; a pass over the week runs it on meals in order.
  // A kind with its own order over the week (polish) gives `runWeek` instead. `better`: strictly improves the
  // search score (`evaluate`); `notWorse`: the search score is not worse; `fewerHard`: the normal score's hard
  // count drops. `on` is the plan the kind changes: `plan`, or `bestPlan` (polish); `repair` copies it to the
  // other after the kind kept something, so every kind starts from the same week.
  type Accept = 'better' | 'notWorse' | 'fewerHard';
  type MoveKind = { name: 'descent' | 'repick' | 'sweep' | 'polish' | 'retry'; accept: Accept; on: 'plan' | 'best' }
    & ({ runMeal(i: number): boolean; runWeek?: never } | { runWeek(): boolean; runMeal?: never });
  /** One pass of `kind` over the week. Whether it kept a change. */
  const runWeek = (kind: MoveKind): boolean => {
    if (kind.runWeek) return kind.runWeek();
    let kept = false;
    for (let i = 0; i < SLOT_COUNT; i++) if (kind.runMeal(i)) kept = true;
    return kept;
  };
  // The move kinds read the meal's parts from `PARTS`; the first part is the base, which is never left empty.
  const [firstPart] = PARTS;
  /** Whether part `p` of meal `i` is not pinned. */
  const isFreePart = (i: number, p: PartDef) => pins[i][p.pin] === undefined;
  /** Meals whose part `p` is not pinned, in order. */
  const freeMeals = new Map(PARTS.map((p) => [p, Array.from({ length: SLOT_COUNT }, (_, i) => i).filter((i) => isFreePart(i, p))]));
  /** Every dish of meal `s` with the part it sits in, parts in order. */
  const dishesOf = (s: Readonly<SlotState>): [number, PartDef][] => PARTS.flatMap((p) => dishesIn(s, p).map((id): [number, PartDef] => [id, p]));
  /** Whether meals `a` and `b` hold the same dishes in every part, in the same order. */
  const sameDishes = (a: Readonly<SlotState>, b: Readonly<SlotState>) =>
    PARTS.every((p) => { const x = dishesIn(a, p); const y = dishesIn(b, p); return x.length === y.length && x.every((e, k) => e === y[k]); });
  // Final descent: the random moves can stop on a plateau one change away from a better week. Try every
  // single change of a free base, curry or subzi (meals in order, roles base, curry, subzi, candidates in
  // library order, no side first) and keep each one that strictly improves the score. One pass per round of
  // the repair loop; further passes are further rounds. Unit members stay while their dish does; a changed
  // dish brings its sides, as in the moves.
  const descent: MoveKind = {
    name: 'descent', accept: 'better', on: 'plan',
    runMeal(i) {
      const s = plan[i];
      let improved = false;
      for (const p of PARTS) {
        if (p.many || !isFreePart(i, p) || !pool[p.role].length) continue;
        const options: readonly (number | undefined)[] = p === firstPart ? pool[p.role] : [undefined, ...pool[p.role]];
        for (const v of options) {
          const cur = dishesIn(s, p)[0];
          if (isUnit(s, i, cur)) break;
          if (v === cur) continue;
          const before = snapshot(s);
          const prev = broughtBy(s, cur, p.role, i);
          const gone = conditionalSides(s, i);
          if (v === undefined) withoutDish(s, p, cur!);
          else withDish(s, p, v);
          bring(i, prev, gone);
          const next = evaluate(plan);
          if (compareScore(next, best) < 0) {
            best = next;
            improved = true;
          } else {
            restore(s, before);
          }
        }
      }
      return improved;
    },
  };

  // Re-pick: a link's pick is made when its dish comes into the meal and is not revisited after, so a pick
  // made while the search briefly had one candidate elsewhere (where a limit ranked it down) would stand.
  // Meals in order, each met want of several candidates is picked again from the week as it now is: its
  // candidate leaves with the sides it brought, `bring` chooses again, and the result is kept unless the
  // score is worse. A kept change need not improve, so each want is picked again at most once per meal over
  // the whole repair loop (`picked` lasts across rounds): otherwise two not-worse picks could take turns
  // round after round.
  /**
   * Picks again, in meal `i` as it now is, each want of several candidates not yet in `picked` (which it
   * extends), until a change is kept. Whether one was.
   */
  const repickOne = (i: number, picked: Set<string>): boolean => {
    const s = plan[i];
    const inMeal = (c: number) => PARTS.some((p) => dishesIn(s, p).includes(c));
    for (const [id, { role }] of dishesOf(s)) {
      if (!inMeal(id)) continue;
      for (const w of mealBrings(m, s, i, id, role).wants) {
        if (w.of.length < 2) continue;
        const key = `${id}:${role}:${w.of.join(',')}`;
        if (picked.has(key)) continue;
        picked.add(key);
        const c = w.of.find(inMeal);
        // The candidate's part, from its dish type: the base is never picked again.
        const part = c === undefined ? undefined : partOf(m.byId.get(c)?.componentType);
        if (c === undefined || !part || part === firstPart) continue;
        if (!isFreePart(i, part)) continue;
        const before = snapshot(s);
        const prev = broughtBy(s, c, part.role, i);
        const gone = conditionalSides(s, i);
        withoutDish(s, part, c);
        bring(i, prev, gone);
        if (inMeal(c) && sameDishes(s, before)) continue;
        const next = evaluate(plan);
        if (compareScore(next, best) <= 0) {
          best = next;
          return true;
        }
        restore(s, before);
      }
    }
    return false;
  };
  /** Per meal, the wants already picked again, over all rounds. */
  const picked = Array.from({ length: SLOT_COUNT }, () => new Set<string>());
  const repick: MoveKind = {
    name: 'repick', accept: 'notWorse', on: 'plan',
    // After a kept change the meal's dishes and wants are read again (a new curry can meet a condition, a
    // brought side can bring its own); each want is still picked at most once, so the pass ends.
    runMeal(i) {
      let kept = false;
      while (repickOne(i, picked[i])) kept = true;
      return kept;
    },
  };

  // A side a pair waiting for a curry or subzi brought is invisible to the search, so a later change to
  // the meal (an extra added beside it) may have made it break a hard rule: such a side leaves the meal
  // wherever that lowers the normal score's hard violations. The missing pair is reported as a soft problem.
  const sweep: MoveKind = {
    name: 'sweep', accept: 'fewerHard', on: 'plan',
    runMeal(i) {
      const s = plan[i];
      let kept = false;
      // Every part but the first, except the curry: sweep has never removed a curry, even one a pair waiting
      // for a subzi brought. Kept by name so this refactor changes no week; the meal-parts project decides.
      for (const [c, p] of dishesOf(s)) {
        if (p === firstPart || p.role === 'curry' || !condOnly(s, i, c)) continue;
        if (!isFreePart(i, p)) continue;
        const before = snapshot(s);
        const hard = score(m, plan).hard;
        withoutDish(s, p, c);
        if (score(m, plan).hard < hard) kept = true;
        else restore(s, before);
      }
      // Sweep keeps by the normal score, so the search score is taken again.
      if (kept) best = evaluate(plan);
      return kept;
    },
  };

  // Polish: drop any free curry, subzi or extra whose removal strictly improves the best plan. Sides
  // cost something unless a rule asks for them, and random search does not always find every removal.
  // Unit members stay; asked-for sides may go.
  /** Polishes part `p` of meal `i`; its dishes are tried last to first. Whether a removal was kept. */
  const polishRole = (p: PartDef, i: number): boolean => {
    const meal = bestPlan[i];
    let kept = false;
    for (let k = dishesIn(meal, p).length - 1; k >= 0; k--) {
      const d = dishesIn(meal, p)[k];
      if (isUnit(meal, i, d)) continue;
      const before = snapshot(meal);
      withoutDish(meal, p, d);
      const s = evaluate(bestPlan);
      if (compareScore(s, best) < 0) { best = s; kept = true; }
      else restore(meal, before);
    }
    return kept;
  };
  // Polish has its own order over the week: role by role (every free curry, then every free subzi, then
  // every free meal's extras), meals in order within a role. Removals are kept against a moving `best`, so
  // the order can change the week.
  const polish: MoveKind = {
    name: 'polish', accept: 'better', on: 'best',
    runWeek() {
      let kept = false;
      for (const p of PARTS) {
        if (p === firstPart) continue;
        for (const i of freeMeals.get(p)!) if (polishRole(p, i)) kept = true;
      }
      return kept;
    },
  };

  // Retry: a side a pair waiting for a curry or subzi would bring is refused where it would break a hard
  // rule, and a later change (an extra leaving, here or in the polish above, or another meal's dish
  // leaving) can make room for it, but nothing brings it again. Meals in order, a meal missing such a side
  // brings its sides again; the result is kept unless the score is worse. A kept retry need not improve, so
  // each meal is retried at most once over the whole repair loop (`retried` lasts across rounds): otherwise a
  // side brought back and removed again could take turns round after round.
  /** Meals already retried, over all rounds. */
  const retried = new Set<number>();
  const retry: MoveKind = {
    name: 'retry', accept: 'notWorse', on: 'plan',
    runMeal(i) {
      const s = plan[i];
      if (retried.has(i) || !missesConditional(s, i)) return false;
      const before = snapshot(s);
      bring(i, NOTHING);
      // With nothing to remove, `bring` only adds: the meal is unchanged exactly when it holds the same dishes.
      if (sameDishes(s, before)) return false;
      retried.add(i);
      const next = evaluate(plan);
      if (compareScore(next, best) <= 0) {
        best = next;
        return true;
      }
      restore(s, before);
      return false;
    },
  };

  /** Rounds the repair loop ran. */
  let repairRounds = 0;
  /**
   * The repair loop: a round runs `kinds` in order, each over the whole week; rounds repeat until one keeps
   * nothing or `rounds` are done. The time limit does not apply. `plan` and `bestPlan` hold the same week
   * before each kind, and `best` is its search score.
   */
  function repair(kinds: readonly MoveKind[], rounds: number): void {
    for (let i = 0; i < SLOT_COUNT; i++) restore(plan[i], bestPlan[i]);
    for (let round = 0; round < rounds; round++) {
      repairRounds++;
      let kept = false;
      for (const kind of kinds) {
        if (!runWeek(kind)) continue;
        kept = true;
        if (kind.on === 'plan') bestPlan = clonePlan(plan);
        else for (let i = 0; i < SLOT_COUNT; i++) restore(plan[i], bestPlan[i]);
      }
      if (!kept) break;
    }
  }
  // Sweep and retry only matter when a pair waits for a curry or subzi.
  repair(hasConditional ? [descent, repick, sweep, polish, retry] : [descent, repick, polish], opts.repairRounds ?? REPAIR_ROUNDS);

  return {
    plan: bestPlan,
    score: score(m, bestPlan, true),
    stats: { iterations, improvements, constructionMs, totalMs: now() - t0, stopReason, repairRounds },
  };
}
