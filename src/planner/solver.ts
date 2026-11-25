// Construct (randomised greedy) then improve (late-acceptance hill climbing).
// Pinned parts are placed first and never moved. Moves only ever produce structurally valid
// slots: one dish in the first part, at most one in every other part that holds one (see `CompiledModel.single`),
// each dish in its own part, no dish twice.
// Placing a dish brings what it is paired with in the same step (`bring`), so a base is always judged
// together with its sides; the sides it must be served with (unit members) are not moved on their own.
import { searchBudget } from './budget';
import { mulberry32 } from './rng';
import { compareScore, freePickLimited, lockNudge, mealBringsAt, mealHasConditional, ownRulesOverridden, partPosition, score, yieldedPreferWeight, type Brings, type CompiledModel, type Score, type ScoreResult } from './scorer';
import { DAYS, MEALS, SLOT_COUNT, dishesIn, emptyPlan, withDish, withoutDish, type PartPins, type PlanState, type Pins, type SlotState } from './types';

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
  /** Candidates sampled per part per slot during construction; 0 = all. Default 10. */
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
    const part = m.byId.get(id)?.part_id;
    return part !== undefined ? yieldedPreferWeight(m, id, part, slot) : 0;
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
  const part = m.byId.get(id)?.part_id;
  const overrides = part !== undefined ? ownRulesOverridden(m, id, part, slot) : 0;
  // At least 0: charging the frequency rules can only add hard units, but a net figure is never a credit.
  const limits = Math.max(0, f.hard - s.hard);
  return { hard: s.hard, overrides, limits, soft: s.soft };
}

type Snapshot = Readonly<SlotState>;
// A part's array is never mutated in place (every change assigns a new array), so a snapshot may share them.
const snapshot = (s: SlotState): Snapshot => ({ parts: s.parts.slice() });
const restore = (s: SlotState, snap: Snapshot) => {
  for (let k = 0; k < snap.parts.length; k++) s.parts[k] = snap.parts[k];
};
/** Whether meals `a` and `b` hold the same dishes in every part, in the same order. */
const sameDishes = (a: Readonly<SlotState>, b: Readonly<SlotState>) =>
  a.parts.every((x, k) => { const y = b.parts[k]; return x === y || (x.length === y.length && x.every((e, j) => e === y[j])); });
/** A one-dish part's new array: `[id]`, or empty. */
const one = (id: number | undefined): number[] => (id === undefined ? [] : [id]);

/**
 * The pivot part: the first part after the first that holds one dish (on a converted library, the Curry), or
 * undefined when there is none. The planner treats it apart in two places, kept as they were so no week moves:
 * - the joint move changes it together with the first part, so pairings that depend on the base stay reachable;
 * - a dish the user locked in it never nudges its meal toward what a conditional link waits for (`lockNudge`).
 * Uses no randomness.
 */
function pivotPart(single: readonly boolean[]): number | undefined {
  const k = single.findIndex((holdsOne, i) => i > 0 && holdsOne);
  return k < 0 ? undefined : k;
}

export const clonePlan = (p: PlanState): PlanState => p.map((s) => ({ parts: s.parts.map((d) => [...d]) }));

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

  // ── Parts ──
  // The first part holds one dish and is never left empty; a part `single` holds at most one, the others many.
  const P = m.parts.length;
  const { single } = m;
  const FIRST = 0;
  const range = (n: number) => Array.from({ length: n }, (_, k) => k);
  /** Parts after the first that hold one dish, in order (on a converted library: Curry, Subzi). */
  const singles = range(P).filter((k) => k !== FIRST && single[k]);
  /** Parts that hold many dishes, in order (on a converted library: Extras). */
  const many = range(P).filter((k) => !single[k]);
  /** Parts the pick and swap moves change. */
  const pickParts = [FIRST, ...singles];
  /** The part the joint move changes with the first, which lock nudges also pass over (`pivotPart`). */
  const jointPart = pivotPart(single);
  /** Position of each dish's own part, or -1 for a part the meal does not have. */
  const partOfDish = new Map(m.library.map((c) => [c.id, partPosition(m, c.part_id)]));
  const ownPart = (id: number): number => partOfDish.get(id) ?? -1;

  const pool: number[][] = range(P).map(() => []);
  for (const c of m.library) {
    const k = ownPart(c.id);
    if (k >= 0) pool[k].push(c.id);
  }

  // ── Pins ──
  const pins: PartPins[] = Array.from(
    { length: SLOT_COUNT },
    (_, i) => opts.pins?.[`${DAYS[Math.floor(i / MEALS.length)]}-${MEALS[i % MEALS.length]}`] ?? {},
  );
  const pinOf = (i: number, k: number): readonly number[] | undefined => pins[i][m.parts[k].id];
  /** Whether the part at position `k` of meal `i` is not pinned. */
  const isFree = (i: number, k: number) => pinOf(i, k) === undefined;
  // Meals where the user locked a part after the first, other than the pivot part (`pivotPart`, the curry), with
  // the locked dishes: there a link waiting for a curry or subzi that brings a locked dish pulls the meal toward
  // that curry or subzi (`lockNudge`). A locked curry has never pulled; on a converted library these are the subzi and extras.
  const locks: { slot: number; ids: readonly number[] }[] = [];
  if (hasConditional) {
    pins.forEach((_, slot) => {
      const ids = range(P).flatMap((k) => (k === FIRST || k === jointPart ? [] : (pinOf(slot, k) ?? [])));
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
  const plan: PlanState = emptyPlan(P).map((s, i) => ({ parts: s.parts.map((d, k) => [...(pinOf(i, k) ?? d)]) }));

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
   * What the dish in part `k` may bring to meal `s` at slot `i`: the candidates of all its wants, or of its unit
   * wants only. A pair that waits for a curry or subzi counts only where `s` meets it.
   */
  const broughtBy = (s: SlotState, id: number | undefined, k: number, i: number, unitOnly = false): readonly number[] => {
    if (!hasPairs || id === undefined) return NOTHING;
    const u = unionsOf(mealBringsAt(m, s, i, id, k));
    return unitOnly ? u.unit : u.asked;
  };
  /** Whether some dish of meal `s` (parts in order) passes `test`; `k` is its part's position. */
  const someDish = (s: SlotState, test: (d: number, k: number) => boolean): boolean => {
    for (let k = 0; k < P; k++) for (const d of s.parts[k]) if (test(d, k)) return true;
    return false;
  };
  const inMealOf = (s: SlotState) => (c: number) => s.parts.some((d) => d.includes(c));
  /**
   * Whether `id` is in slot `i` only because a pair waiting for a curry or subzi brought it: some dish there
   * brings it by such a pair, and none by another pair.
   */
  const condOnly = (s: SlotState, i: number, id: number): boolean => {
    if (!hasConditional || !mealHasConditional(m, s, i)) return false;
    let cond = false;
    // A dish that brings `id` by a plain pair ends the walk.
    const plain = someDish(s, (d, k) => {
      if (d === id) return false;
      const u = unionsOf(mealBringsAt(m, s, i, d, k));
      if (u.plain.includes(id)) return true;
      if (u.cond.includes(id)) cond = true;
      return false;
    });
    return !plain && cond;
  };
  /** Whether a dish of meal `s` at slot `i` has a met pair waiting for a curry or subzi with no candidate in the meal. */
  const missesConditional = (s: SlotState, i: number): boolean => {
    if (!mealHasConditional(m, s, i)) return false;
    const inMeal = inMealOf(s);
    return someDish(s, (d, k) => mealBringsAt(m, s, i, d, k).wants.some((w) => w.cond && !w.of.some(inMeal)));
  };
  /** Whether `id` is in slot `i` as a unit member: another dish there must be served with it. */
  const isUnit = (s: SlotState, i: number, id: number | undefined): boolean => {
    if (!hasPairs || id === undefined) return false;
    return someDish(s, (d, k) => d !== id && broughtBy(s, d, k, i, true).includes(id));
  };
  const timesPlanned = (id: number) => plan.reduce((n, s) => (s.parts.some((d) => d.includes(id)) ? n + 1 : n), 0);
  /**
   * Every side the dishes of meal `s` bring, read before a change for `bring`'s `gone`: a change to the
   * curry or subzi can take a side away from a dish that stays, when the side came by a pair waiting for
   * that curry or subzi (or a met condition took the side's part from a plain pair). Nothing when no dish of
   * the meal has a pair with a condition, since then only the replaced dish's sides (`prev`) can stop being brought.
   */
  const conditionalSides = (s: SlotState, i: number): readonly number[] => {
    if (!hasConditional || !mealHasConditional(m, s, i)) return NOTHING;
    const out = new Set<number>();
    for (let k = 0; k < P; k++) for (const id of s.parts[k]) for (const c of broughtBy(s, id, k, i)) out.add(c);
    return out.size ? [...out] : NOTHING;
  };
  /**
   * After a change to a one-dish part of slot `i` (the base, curry or subzi), first remove the sides the
   * replaced dish brought (`prev`), and the sides the meal's dishes brought before the change (`gone`, from
   * `conditionalSides`), that no dish in the meal still brings, then, for each want of its dishes with no
   * candidate in the meal, bring one of its candidates into its own part when that part is not pinned and,
   * holding one dish, is empty or holds a side the replaced dish brought. Among several candidates that fit,
   * `chooseCandidate` picks. Unit members may take such a part; asked-for sides only fill an empty one. A part
   * holding many dishes (extras) is appended to. Repeats while anything changes, since a brought side can bring
   * its own. Uses no randomness.
   */
  const bring = (i: number, prev: readonly number[], gone: readonly number[] = NOTHING) => {
    if (!hasPairs) return;
    const s = plan[i];
    let changed = false;
    /** The plan's hard score with meal `i` as these fields hold, for `addsNoHard`. */
    let hardBefore: (Snapshot & { hard: number }) | undefined;
    /**
     * Whether `place(c, unit, from)` would put `c` in the meal, for a want of a dish in part `from`. The first
     * part is never brought. A higher part decides: a unit want takes a one-dish part from a unit member that
     * only dishes of lower parts bring (Idli's Avial takes the subzi from the Beans Poriyal served with Sambar).
     */
    const fits = (c: number, unit: boolean, from: number): boolean => {
      const k = ownPart(c);
      if (k <= FIRST) return false;
      if (!single[k]) return isFree(i, k) && !s.parts[k].includes(c);
      const cur = s.parts[k][0];
      if (cur === c || !isFree(i, k)) return false;
      if (cur === undefined) return true;
      if (!unit) return false;
      const curIsUnit = isUnit(s, i, cur);
      if (prev.includes(cur) && !curIsUnit) return true;
      return curIsUnit && !someDish(s, (d, j) => j <= from && d !== cur && broughtBy(s, d, j, i, true).includes(cur));
    };
    const place = (c: number, unit: boolean, from: number) => {
      if (!fits(c, unit, from)) return;
      const k = ownPart(c);
      withDish(s, k, c, single[k]);
      changed = true;
    };
    // A candidate is judged with what it brings in turn (each want's first candidate that fits), so its
    // own pairings do not count against it. With `blind`, it is judged as the search judges a curry: blind
    // to what pairs waiting for a curry or subzi bring or miss.
    const scoreWith = (unit: boolean, from: number, blind: boolean) => (c: number): BroughtScore => {
      const before = snapshot(s);
      const was = changed;
      place(c, unit, from);
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
    const addsNoHard = (c: number, unit: boolean, from: number): boolean => {
      const before = snapshot(s);
      const was = changed;
      // Only this meal changes during a bring, so the meal's dishes name the plan's state: the hard score
      // before placing is reused while they hold.
      if (!hardBefore || !sameDishes(hardBefore, s)) hardBefore = { ...before, hard: score(m, plan).hard };
      const hard = hardBefore.hard;
      place(c, unit, from);
      const after = score(m, plan).hard;
      restore(s, before);
      changed = was;
      return after <= hard;
    };
    const inMeal = inMealOf(s);
    const visit = (id: number, k: number, choose: boolean) => {
      for (const w of mealBringsAt(m, s, i, id, k).wants) {
        if (w.of.some(inMeal)) continue;
        const allowed = (c: number) => fits(c, w.unit, k) && (!w.cond || addsNoHard(c, w.unit, k));
        if (w.of.length === 1) {
          if (!w.cond || allowed(w.of[0])) place(w.of[0], w.unit, k);
          continue;
        }
        const options = w.of.filter(allowed);
        if (!options.length) continue;
        // A plain link's pick (Sambar or Rasam) must not see what a conditional link would bring with it;
        // a conditional link's own candidates (Papad or Murukku) are ranked on the whole meal.
        place(choose ? chooseCandidate(options, i, scoreWith(w.unit, k, hasConditional && !w.cond), timesPlanned, sampleSize, candidateWeight(m, i), offsetOf, compareBrought) : options[0], w.unit, k);
      }
    };
    /** Brings each meal dish's missing wants, `BRING_ROUNDS` times at most; `choose` picks among candidates. */
    const fill = (choose: boolean) => {
      for (let round = 0; round < BRING_ROUNDS; round++) {
        changed = false;
        // Parts in order, each read when its turn comes: an earlier part's dish may have brought into it.
        for (let k = 0; k < P; k++) for (const id of s.parts[k]) visit(id, k, choose);
        if (!changed) break;
      }
    };
    // The replaced dish's sides leave with it, unless a dish still in the meal brings them too; so do the
    // sides a dish brought only while the meal met a condition it no longer meets.
    const stillBrought = (c: number) => someDish(s, (d, k) => d !== c && broughtBy(s, d, k, i).includes(c));
    for (const c of gone.length ? both(prev, gone) : prev) {
      const k = ownPart(c);
      if (k <= FIRST) continue;
      // A one-dish part is emptied only when it holds `c`, as `c` is its only dish.
      if (s.parts[k].includes(c) && isFree(i, k) && !stillBrought(c)) withoutDish(s, k, c);
    }
    fill(true);
  };
  /**
   * Whether dish `id` in part `k` of meal `s` at slot `i` brings something into another part there: a dish of a
   * many-dish part (a curry on a library with no cap on curries) can bring the dishes served with it. Only such a
   * dish's add or removal runs `bring`. A dish whose links all stay in its own part (an extra that comes with
   * another extra) is added and removed alone, as before, so its weeks do not change.
   */
  const bringsAcross = (s: SlotState, id: number, k: number, i: number): boolean => broughtBy(s, id, k, i).some((c) => ownPart(c) !== k);
  /** Sides brought by the dishes in two parts, for `bring`'s `prev`. */
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
  // Per meal: the first part, then the other one-dish parts in order, then the many-dish parts in order.
  for (let i = 0; i < SLOT_COUNT; i++) {
    const s = plan[i];
    if (isFree(i, FIRST) && pool[FIRST].length) {
      // Each first-part dish (base) is judged with the sides it brings.
      const before = snapshot(s);
      const prev = broughtBy(s, s.parts[FIRST][0], FIRST, i);
      const gone = conditionalSides(s, i);
      chooseBest(sample(pool[FIRST]), (id) => { restore(s, before); s.parts[FIRST] = [id]; bring(i, prev, gone); });
    } else {
      bring(i, NOTHING);
    }
    for (const k of singles) {
      const cur = s.parts[k][0];
      if (!isFree(i, k) || isUnit(s, i, cur)) continue;
      const before = snapshot(s);
      const prev = broughtBy(s, cur, k, i);
      const gone = conditionalSides(s, i);
      const options: (number | undefined)[] = [undefined, ...sample(pool[k])];
      // A side already brought (asked for) stays an option.
      if (cur !== undefined && !options.includes(cur)) options.push(cur);
      chooseBest(options, (id) => { restore(s, before); s.parts[k] = one(id); bring(i, prev, gone); });
    }
    for (const k of many) {
      if (!isFree(i, k)) continue;
      // Many-dish parts (extras) are optional: add one only while it strictly improves the score. A dish that
      // brings others (a curry with an extra served with it) is judged with them, as a base is.
      for (;;) {
        const before = s.parts[k];
        const meal = snapshot(s);
        const add = (id: number) => {
          restore(s, meal);
          s.parts[k] = [...before, id];
          if (bringsAcross(s, id, k, i)) bring(i, NOTHING);
        };
        const current = evaluate(plan);
        const improving = sample(pool[k].filter((e) => !before.includes(e))).filter((id) => {
          add(id);
          const better = compareScore(evaluate(plan), current) < 0;
          restore(s, meal);
          return better;
        });
        if (!improving.length) break;
        chooseBest(improving, add);
      }
    }
  }
  const constructionMs = now() - t0;

  // ── Local search ──
  /** By part position: the meals whose part is not pinned, in order. */
  const free = range(P).map((k) => range(SLOT_COUNT).filter((i) => isFree(i, k)));
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
      // Change (or drop, past the first) one one-dish part's dish. A unit member stays while its dish does.
      const k = pick(pickParts);
      if (!free[k].length || !pool[k].length) continue;
      const i = pick(free[k]);
      const s = plan[i];
      const cur = s.parts[k][0];
      if (isUnit(s, i, cur)) continue;
      const v = k !== FIRST && rng() < 0.15 ? undefined : pick(pool[k]);
      const prev = broughtBy(s, cur, k, i);
      const gone = conditionalSides(s, i);
      touch(s);
      s.parts[k] = one(v);
      bring(i, prev, gone);
    } else if (move < 0.6) {
      // Change the first part's dish and the next one-dish part's (base and curry) together, so pairings that
      // depend on the base stay reachable. The base's sides come first; the new curry takes the part only if
      // they leave it empty.
      const j = jointPart;
      const slots = j === undefined ? free[FIRST] : free[FIRST].filter((i) => isFree(i, j));
      if (!slots.length || !pool[FIRST].length) continue;
      const i = pick(slots);
      const s = plan[i];
      const firstDish = pick(pool[FIRST]);
      const second = j !== undefined && pool[j].length ? pick(pool[j]) : undefined;
      const prev = j === undefined
        ? broughtBy(s, s.parts[FIRST][0], FIRST, i)
        : both(broughtBy(s, s.parts[FIRST][0], FIRST, i), broughtBy(s, s.parts[j][0], j, i));
      const gone = conditionalSides(s, i);
      touch(s);
      if (j !== undefined) s.parts[j] = [];
      s.parts[FIRST] = [firstDish];
      bring(i, prev, gone);
      if (j !== undefined && !s.parts[j].length && second !== undefined) {
        s.parts[j] = [second];
        bring(i, NOTHING);
      }
    } else if (move < 0.8) {
      // Swap the same one-dish part between two slots. Unit members stay with their dish.
      const k = pick(pickParts);
      if (free[k].length < 2) continue;
      const ia = pick(free[k]);
      const ib = pick(free[k]);
      const a = plan[ia];
      const b = plan[ib];
      const va = a.parts[k][0];
      const vb = b.parts[k][0];
      if (a === b || va === vb || isUnit(a, ia, va) || isUnit(b, ib, vb)) continue;
      const prevA = broughtBy(a, va, k, ia);
      const prevB = broughtBy(b, vb, k, ib);
      const goneA = conditionalSides(a, ia);
      const goneB = conditionalSides(b, ib);
      touch(a);
      touch(b);
      a.parts[k] = one(vb);
      b.parts[k] = one(va);
      bring(ia, prevA, goneA);
      bring(ib, prevB, goneB);
    } else {
      // Add or remove one dish of a many-dish part (an extra). A unit member stays while its dish does.
      // On a converted library there is one such part (Extras), chosen without a draw.
      if (!many.length) continue;
      const k = many.length === 1 ? many[0] : pick(many);
      if (!free[k].length || !pool[k].length) continue;
      const withDishes = free[k].filter((i) => plan[i].parts[k].length > 0);
      const remove = withDishes.length > 0 && rng() < 0.5;
      const i = pick(remove ? withDishes : free[k]);
      const s = plan[i];
      const old = s.parts[k];
      // A dish that brings others brings them as it comes and takes them as it goes (`bring`), as a base does.
      let then: (() => void) | undefined;
      if (remove) {
        const x = Math.floor(rng() * old.length);
        // Nor does a side a pair waiting for the meal's curry or subzi brought: the search does not see it.
        if (isUnit(s, i, old[x]) || condOnly(s, i, old[x])) continue;
        if (bringsAcross(s, old[x], k, i)) {
          const prev = broughtBy(s, old[x], k, i);
          const gone = conditionalSides(s, i);
          then = () => bring(i, prev, gone);
        }
        s.parts[k] = old.filter((_, j) => j !== x);
      } else {
        const e = pick(pool[k]);
        if (old.includes(e)) continue;
        s.parts[k] = [...old, e];
        if (bringsAcross(s, e, k, i)) then = () => bring(i, NOTHING);
      }
      const snap = snapshot(s);
      snap.parts[k] = old;
      undo.push({ s, snap });
      then?.();
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
  // The move kinds read the meal's parts by position; the first part (the base) is never left empty.
  /** Every dish of meal `s` with the position of the part it sits in, parts in order. */
  const dishesOf = (s: Readonly<SlotState>): [number, number][] =>
    range(P).flatMap((k) => dishesIn(s, k).map((id): [number, number] => [id, k]));
  // Final descent: the random moves can stop on a plateau one change away from a better week. Try every
  // single change of a free one-dish part (the base, curry or subzi; meals in order, parts in order, candidates in
  // library order, no side first) and keep each one that strictly improves the score. One pass per round of
  // the repair loop; further passes are further rounds. Unit members stay while their dish does; a changed
  // dish brings its sides, as in the moves.
  const descent: MoveKind = {
    name: 'descent', accept: 'better', on: 'plan',
    runMeal(i) {
      const s = plan[i];
      let improved = false;
      for (let k = 0; k < P; k++) {
        if (!single[k] || !isFree(i, k) || !pool[k].length) continue;
        const options: readonly (number | undefined)[] = k === FIRST ? pool[k] : [undefined, ...pool[k]];
        for (const v of options) {
          const cur = dishesIn(s, k)[0];
          if (isUnit(s, i, cur)) break;
          if (v === cur) continue;
          const before = snapshot(s);
          const prev = broughtBy(s, cur, k, i);
          const gone = conditionalSides(s, i);
          if (v === undefined) withoutDish(s, k, cur!);
          else withDish(s, k, v, true);
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
    const inMeal = inMealOf(s);
    for (const [id, k] of dishesOf(s)) {
      if (!inMeal(id)) continue;
      for (const w of mealBringsAt(m, s, i, id, k).wants) {
        if (w.of.length < 2) continue;
        const key = `${id}:${k}:${w.of.join(',')}`;
        if (picked.has(key)) continue;
        picked.add(key);
        const c = w.of.find(inMeal);
        // The candidate's own part: the first part's dish (the base) is never picked again.
        const part = c === undefined ? -1 : ownPart(c);
        if (c === undefined || part <= FIRST) continue;
        if (!isFree(i, part)) continue;
        const before = snapshot(s);
        const prev = broughtBy(s, c, part, i);
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
  // No cross-round memory: sweep only removes, keeping a removal only when it lowers the hard count, and it runs
  // after descent in every round; REPAIR_ROUNDS bounds any descent <-> sweep alternation.
  const sweep: MoveKind = {
    name: 'sweep', accept: 'fewerHard', on: 'plan',
    runMeal(i) {
      const s = plan[i];
      let kept = false;
      // Every part but the first, the curry included: a curry only a pair waiting for a subzi brought leaves
      // like any other side where it breaks a hard rule (rule case `sweep-takes-out-a-brought-curry`).
      for (const [c, k] of dishesOf(s)) {
        if (k === FIRST || !condOnly(s, i, c)) continue;
        if (!isFree(i, k)) continue;
        const before = snapshot(s);
        const hard = score(m, plan).hard;
        withoutDish(s, k, c);
        if (score(m, plan).hard < hard) kept = true;
        else restore(s, before);
      }
      // Sweep keeps by the normal score, so the search score is taken again.
      if (kept) best = evaluate(plan);
      return kept;
    },
  };

  // Polish: drop any free curry, subzi or extra (a dish of any part after the first) whose removal strictly
  // improves the best plan. Sides cost something unless a rule asks for them, and random search does not
  // always find every removal. Unit members stay; asked-for sides may go.
  /** Polishes part `k` of meal `i`; its dishes are tried last to first. Whether a removal was kept. */
  const polishPart = (k: number, i: number): boolean => {
    const meal = bestPlan[i];
    let kept = false;
    for (let x = dishesIn(meal, k).length - 1; x >= 0; x--) {
      const d = dishesIn(meal, k)[x];
      if (isUnit(meal, i, d)) continue;
      const before = snapshot(meal);
      withoutDish(meal, k, d);
      const s = evaluate(bestPlan);
      if (compareScore(s, best) < 0) { best = s; kept = true; }
      else restore(meal, before);
    }
    return kept;
  };
  // Polish has its own order over the week: part by part (every free curry, then every free subzi, then
  // every free meal's extras), meals in order within a part. Removals are kept against a moving `best`, so
  // the order can change the week.
  const polish: MoveKind = {
    name: 'polish', accept: 'better', on: 'best',
    runWeek() {
      let kept = false;
      for (let k = FIRST + 1; k < P; k++) for (const i of free[k]) if (polishPart(k, i)) kept = true;
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
