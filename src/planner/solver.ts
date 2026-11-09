// Construct (randomised greedy) then improve (late-acceptance hill climbing).
// Pinned values are placed first and never moved. Moves only ever produce structurally valid
// slots: one base, at most one curry and subzi, each from its own component type, no duplicate extras.
// Placing a dish brings what it is paired with in the same step (`bring`), so a base is always judged
// together with its sides; the sides it must be served with (unit members) are not moved on their own.
import { mulberry32 } from './rng';
import { compareScore, mealBrings, ownRulesOverridden, score, yieldedPreferWeight, type Brings, type CompiledModel, type Score, type ScoreResult } from './scorer';
import { DAYS, MEALS, SLOT_COUNT, emptyPlan, type PlanState, type Pins, type Role, type SlotPins, type SlotState } from './types';

export interface SolveOptions {
  seed?: number;
  pins?: Pins;
  /** Wall-clock cap for the whole solve, in ms. Default 300. */
  timeLimitMs?: number;
  /** Cap on local-search iterations. Default 200 000. */
  maxIterations?: number;
  /** Stop once no hard violations remain and the best score has not improved for this many iterations. Default 3000. */
  plateauIterations?: number;
  /** Late-acceptance history length. Default 40. */
  lateAcceptance?: number;
  /** Candidates sampled per role per slot during construction; 0 = all. Default 10. */
  constructionSample?: number;
  /** Softmax temperature over soft score when choosing construction candidates; higher = more variety. Default 1. */
  temperature?: number;
}

export type StopReason = 'plateau' | 'time' | 'iterations';

export interface SolveResult {
  plan: PlanState;
  score: ScoreResult;
  stats: { iterations: number; improvements: number; constructionMs: number; totalMs: number; stopReason: StopReason };
}

type PickRole = 'base' | 'curry' | 'subzi';
const PICK_ROLES: readonly PickRole[] = ['base', 'curry', 'subzi'];
const PIN_KEY = { base: 'base_id', curry: 'curry_id', subzi: 'subzi_id', extras: 'extra_ids' } as const;
const now = (): number => globalThis.performance?.now() ?? Date.now();
const NOTHING: readonly number[] = [];
/** Rounds of `bring`: a brought side may bring its own sides. */
const BRING_ROUNDS = 3;
/** Most passes of the final descent; it stops sooner once a pass changes nothing. */
const DESCENT_PASSES = 10;
/** Default `constructionSample`. */
const SAMPLE_SIZE = 10;
/** Puts a brought dish's broken own rules ahead of every soft cost when choosing among a want's candidates. */
const OVERRIDE_WEIGHT = 1e6;
/**
 * Puts each unit of a brought dish's hard frequency limits (which give way to it, so the score does not
 * charge them) ahead of every soft cost when choosing among a want's candidates; below OVERRIDE_WEIGHT, so a dish's
 * days and meals outrank its limits.
 */
const LIMIT_WEIGHT = 1e3;
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
export function chooseCandidate(
  candidates: readonly number[],
  slot: number,
  scoreWith: (id: number) => Score,
  timesPlanned: (id: number) => number,
  limit = SAMPLE_SIZE,
  weightOf: (id: number) => number = () => 0,
  offsetOf: (id: number) => number = () => 0.5,
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
    const c = compareScore(s, bestScore);
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
 * through `candidateWeight`.
 */
export function broughtScore(m: CompiledModel, plan: PlanState, slot: number, id: number): Score {
  const s = score(m, plan);
  const f = score(m, plan, false, { freePick: { id } });
  const type = m.byId.get(id)?.componentType;
  const overrides = type ? ownRulesOverridden(m, id, type, slot) : 0;
  // At least 0: charging the frequency rules can only add hard units, but a net figure is never a credit.
  const limits = Math.max(0, f.hard - s.hard);
  return { hard: s.hard, soft: overrides * OVERRIDE_WEIGHT + limits * LIMIT_WEIGHT + s.soft };
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
  const deadline = t0 + (opts.timeLimitMs ?? 300);
  const maxIterations = opts.maxIterations ?? 200_000;
  const plateau = opts.plateauIterations ?? 3000;
  const sampleSize = opts.constructionSample ?? SAMPLE_SIZE;
  const temperature = opts.temperature ?? 1;
  const evaluate = (p: PlanState): Score => score(m, p);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

  const pool: Record<PickRole | 'extra', number[]> = { base: [], curry: [], subzi: [], extra: [] };
  for (const c of m.library) pool[c.componentType].push(c.id);

  // ── Pins ──
  const pins: SlotPins[] = Array.from(
    { length: SLOT_COUNT },
    (_, i) => opts.pins?.[`${DAYS[Math.floor(i / MEALS.length)]}-${MEALS[i % MEALS.length]}`] ?? {},
  );
  const plan: PlanState = emptyPlan().map((s, i) => {
    const p = pins[i];
    return { base: p.base_id, curry: p.curry_id ?? undefined, subzi: p.subzi_id ?? undefined, extras: p.extra_ids ? [...p.extra_ids] : s.extras };
  });
  const isFree = (i: number, r: PickRole | 'extras') => pins[i][PIN_KEY[r]] === undefined;

  // ── Pairings ──
  const hasPairs = m.constraints.some((c) => c.kind === 'pair');
  /** Whether some pair waits for a curry or subzi in the meal. */
  const hasConditional = m.constraints.some((c) => c.kind === 'pair' && !!c.inMeal?.length);
  /** Every candidate of a dish's wants (asked for), and of its unit wants only. Cached per memoised `Brings`. */
  const unions = new WeakMap<Brings, { asked: readonly number[]; unit: readonly number[] }>();
  /**
   * What the dish in `role` may bring to meal `s` at slot `i`: the candidates of all its wants, or of its unit
   * wants only. A pair that waits for a curry or subzi counts only where `s` meets it.
   */
  const broughtBy = (s: SlotState, id: number | undefined, role: Role, i: number, unitOnly = false): readonly number[] => {
    if (!hasPairs || id === undefined) return NOTHING;
    const b = mealBrings(m, s, i, id, role);
    let u = unions.get(b);
    if (!u) {
      const asked = new Set<number>();
      const unit = new Set<number>();
      for (const w of b.wants) for (const c of w.of) { asked.add(c); if (w.unit) unit.add(c); }
      u = { asked: asked.size ? [...asked] : NOTHING, unit: unit.size ? [...unit] : NOTHING };
      unions.set(b, u);
    }
    return unitOnly ? u.unit : u.asked;
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
   * that curry or subzi (or a met condition took the side's role from a plain pair). Nothing when no pair has
   * a condition, since then only the replaced dish's sides (`prev`) can stop being brought.
   */
  const conditionalSides = (s: SlotState, i: number): readonly number[] => {
    if (!hasConditional) return NOTHING;
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
    // own pairings do not count against it.
    const scoreWith = (unit: boolean) => (c: number): Score => {
      const before = snapshot(s);
      const was = changed;
      place(c, unit);
      fill(false);
      const result = broughtScore(m, plan, i, c);
      restore(s, before);
      changed = was;
      return result;
    };
    const inMeal = (c: number) => s.base === c || s.curry === c || s.subzi === c || s.extras.includes(c);
    const visit = (id: number | undefined, role: Role, choose: boolean) => {
      if (id === undefined) return;
      for (const w of mealBrings(m, s, i, id, role).wants) {
        if (w.of.some(inMeal)) continue;
        if (w.of.length === 1) {
          place(w.of[0], w.unit);
          continue;
        }
        const options = w.of.filter((c) => fits(c, w.unit));
        if (!options.length) continue;
        place(choose ? chooseCandidate(options, i, scoreWith(w.unit), timesPlanned, sampleSize, candidateWeight(m, i), offsetOf) : options[0], w.unit);
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
    if ((iterations & 63) === 0 && now() >= deadline) { stopReason = 'time'; break; }
    if (best.hard === 0 && sinceImprovement >= plateau) { stopReason = 'plateau'; break; }
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
        if (isUnit(s, i, old[k])) continue;
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

  // Final descent: the random moves can stop on a plateau one change away from a better week. Try every
  // single change of a free base, curry or subzi (meals in order, roles base, curry, subzi, candidates in
  // library order, no side first) and keep each one that strictly improves the score, until a full pass
  // finds none or DESCENT_PASSES are done (the time limit does not apply here). Unit members stay while their
  // dish does; a changed dish brings its sides, as in the moves.
  for (let i = 0; i < SLOT_COUNT; i++) restore(plan[i], bestPlan[i]);
  let descended = false;
  for (let pass = 0; pass < DESCENT_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = plan[i];
      for (const r of PICK_ROLES) {
        if (!isFree(i, r) || !pool[r].length) continue;
        const options: readonly (number | undefined)[] = r === 'base' ? pool.base : [undefined, ...pool[r]];
        for (const v of options) {
          if (isUnit(s, i, s[r])) break;
          if (v === s[r]) continue;
          const before = snapshot(s);
          const prev = broughtBy(s, s[r], r, i);
          const gone = conditionalSides(s, i);
          s[r] = v;
          bring(i, prev, gone);
          const next = evaluate(plan);
          if (compareScore(next, best) < 0) {
            best = next;
            improved = descended = true;
          } else {
            restore(s, before);
          }
        }
      }
    }
    if (!improved) break;
  }
  // Re-pick: a link's pick is made when its dish comes into the meal and is not revisited after, so a pick
  // made while the search briefly had one candidate elsewhere (where a limit ranked it down) would stand.
  // Once, meals in order, each met want of several candidates is picked again from the week as it now is:
  // its candidate leaves with the sides it brought, `bring` chooses again, and the result is kept unless
  // the score is worse.
  for (let i = 0; i < SLOT_COUNT; i++) {
    const s = plan[i];
    const inMeal = (c: number) => s.base === c || s.curry === c || s.subzi === c || s.extras.includes(c);
    const dishes: [number | undefined, Role][] = [[s.base, 'base'], [s.curry, 'curry'], [s.subzi, 'subzi'], ...s.extras.map((e): [number, Role] => [e, 'extra'])];
    for (const [id, role] of dishes) {
      if (id === undefined || !inMeal(id)) continue;
      for (const w of mealBrings(m, s, i, id, role).wants) {
        if (w.of.length < 2) continue;
        const c = w.of.find(inMeal);
        const type = c === undefined ? undefined : m.byId.get(c)?.componentType;
        if (c === undefined || (type !== 'curry' && type !== 'subzi' && type !== 'extra')) continue;
        if (!isFree(i, type === 'extra' ? 'extras' : type)) continue;
        const before = snapshot(s);
        const prev = broughtBy(s, c, type, i);
        const gone = conditionalSides(s, i);
        if (type === 'extra') s.extras = s.extras.filter((e) => e !== c);
        else s[type] = undefined;
        bring(i, prev, gone);
        if (inMeal(c) && s.base === before.base && s.curry === before.curry && s.subzi === before.subzi && s.extras.length === before.extras.length && s.extras.every((e, k) => e === before.extras[k])) continue;
        const next = evaluate(plan);
        if (compareScore(next, best) <= 0) {
          best = next;
          descended = true;
        } else {
          restore(s, before);
        }
      }
    }
  }
  if (descended) bestPlan = clonePlan(plan);

  // Polish: drop any free curry, subzi or extra whose removal strictly improves the best plan. Sides
  // cost something unless a rule asks for them, and random search does not always find every removal.
  // Unit members stay; asked-for sides may go.
  for (const r of ['curry', 'subzi'] as const) {
    for (const i of free[r]) {
      const old = bestPlan[i][r];
      if (old === undefined || isUnit(bestPlan[i], i, old)) continue;
      bestPlan[i][r] = undefined;
      const s = evaluate(bestPlan);
      if (compareScore(s, best) < 0) best = s;
      else bestPlan[i][r] = old;
    }
  }
  for (const i of free.extras) {
    for (let k = bestPlan[i].extras.length - 1; k >= 0; k--) {
      const old = bestPlan[i].extras;
      if (isUnit(bestPlan[i], i, old[k])) continue;
      bestPlan[i].extras = old.filter((_, j) => j !== k);
      const s = evaluate(bestPlan);
      if (compareScore(s, best) < 0) best = s;
      else bestPlan[i].extras = old;
    }
  }

  return {
    plan: bestPlan,
    score: score(m, bestPlan, true),
    stats: { iterations, improvements, constructionMs, totalMs: now() - t0, stopReason },
  };
}
