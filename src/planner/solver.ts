// Construct (randomised greedy) then improve (late-acceptance hill climbing).
// Pinned values are placed first and never moved. Moves only ever produce structurally valid
// slots: one base, at most one curry and subzi, each from its own component type, no duplicate extras.
import { mulberry32 } from './rng';
import { compareScore, score, type CompiledModel, type Score, type ScoreResult } from './scorer';
import { DAYS, MEALS, SLOT_COUNT, emptyPlan, type PlanState, type Pins, type SlotPins, type SlotState } from './types';

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

export const clonePlan = (p: PlanState): PlanState => p.map((s) => ({ ...s, extras: [...s.extras] }));

export function solve(m: CompiledModel, opts: SolveOptions = {}): SolveResult {
  const t0 = now();
  const rng = mulberry32(opts.seed ?? 1);
  const deadline = t0 + (opts.timeLimitMs ?? 300);
  const maxIterations = opts.maxIterations ?? 200_000;
  const plateau = opts.plateauIterations ?? 3000;
  const sampleSize = opts.constructionSample ?? 10;
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
    return { base: p.base_id, curry: p.curry_id, subzi: p.subzi_id, extras: p.extra_ids ? [...p.extra_ids] : s.extras };
  });
  const isFree = (i: number, r: PickRole | 'extras') => pins[i][PIN_KEY[r]] === undefined;

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
    if (isFree(i, 'base') && pool.base.length) chooseBest(sample(pool.base), (id) => { s.base = id; });
    for (const r of ['curry', 'subzi'] as const) {
      if (isFree(i, r)) chooseBest<number | undefined>([undefined, ...sample(pool[r])], (id) => { s[r] = id; });
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

    const undo: (() => void)[] = [];
    const set = (s: SlotState, r: PickRole, v: number | undefined) => {
      const old = s[r];
      undo.push(() => { s[r] = old; });
      s[r] = v;
    };
    const move = rng();
    if (move < 0.45) {
      // Change (or drop, for optional roles) one role's component.
      const r = pick(PICK_ROLES);
      if (!free[r].length || !pool[r].length) continue;
      const s = plan[pick(free[r])];
      set(s, r, r !== 'base' && rng() < 0.15 ? undefined : pick(pool[r]));
    } else if (move < 0.6) {
      // Change base and curry together, so pairings that depend on the base stay reachable.
      const slots = free.base.filter((i) => isFree(i, 'curry'));
      if (!slots.length || !pool.base.length) continue;
      const s = plan[pick(slots)];
      set(s, 'base', pick(pool.base));
      set(s, 'curry', pool.curry.length ? pick(pool.curry) : undefined);
    } else if (move < 0.8) {
      // Swap the same role between two slots.
      const r = pick(PICK_ROLES);
      if (free[r].length < 2) continue;
      const a = plan[pick(free[r])];
      const b = plan[pick(free[r])];
      if (a === b || a[r] === b[r]) continue;
      const va = a[r];
      set(a, r, b[r]);
      set(b, r, va);
    } else {
      // Add or remove one extra.
      if (!free.extras.length || !pool.extra.length) continue;
      const withExtras = free.extras.filter((i) => plan[i].extras.length > 0);
      const remove = withExtras.length > 0 && rng() < 0.5;
      const s = plan[pick(remove ? withExtras : free.extras)];
      const old = s.extras;
      if (remove) {
        const k = Math.floor(rng() * old.length);
        s.extras = old.filter((_, j) => j !== k);
      } else {
        const e = pick(pool.extra);
        if (old.includes(e)) continue;
        s.extras = [...old, e];
      }
      undo.push(() => { s.extras = old; });
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
      for (let k = undo.length - 1; k >= 0; k--) undo[k]();
    }
    history[h] = current;
  }

  // Polish: drop any free extra whose removal strictly improves the best plan.
  for (const i of free.extras) {
    for (let k = bestPlan[i].extras.length - 1; k >= 0; k--) {
      const old = bestPlan[i].extras;
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
