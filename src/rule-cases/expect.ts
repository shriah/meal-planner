// Expectation helpers: each is a sentence with a check over the planned weeks.
import type { Day, Meal, PlanSlotLike } from '@/planner';
import type { CaseLibrary, CaseWeeks, PlanExpectation } from './types';

const idsOf = (s: PlanSlotLike): number[] =>
  [s.base_id, s.curry_id, s.subzi_id, ...s.extra_ids].filter((x): x is number => x !== undefined);
const slotsOf = (w: CaseWeeks): PlanSlotLike[] => w.weeks.flat();
const countOf = (w: CaseWeeks, dishId: number): number => slotsOf(w).filter((s) => idsOf(s).includes(dishId)).length;
const times = (n: number) => (n === 1 ? '1 time' : `${n} times`);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export const plannedAtLeast = (dish: string, n: number): PlanExpectation => ({
  says: `${dish} is planned at least ${times(n)} over the 8 weeks`,
  check: (w) => {
    const got = countOf(w, w.lib.dish(dish).id);
    return { pass: got >= n, got: `${got} times` };
  },
});

export const plannedBetween = (dish: string, min: number, max: number): PlanExpectation => ({
  says: `${dish} is planned between ${min} and ${max} times over the 8 weeks`,
  check: (w) => {
    const got = countOf(w, w.lib.dish(dish).id);
    return { pass: got >= min && got <= max, got: `${got} times` };
  },
});

export const everyMealWith = (dish: string, alsoHas: string[]): PlanExpectation => {
  // The runner checks before it highlights, so the library of the run is known by then.
  let lib: CaseLibrary | undefined;
  return {
    says: `Every ${dish} meal has ${list(alsoHas)}`,
    check: (w) => {
      lib = w.lib;
      const id = w.lib.dish(dish).id;
      const need = alsoHas.map((n) => w.lib.dish(n).id);
      const meals = slotsOf(w).filter((s) => idsOf(s).includes(id));
      const k = meals.filter((s) => need.every((n) => idsOf(s).includes(n))).length;
      return { pass: meals.length > 0 && k === meals.length, got: `${k} of ${meals.length}` };
    },
    highlights: (slot) => lib !== undefined && idsOf(slot).includes(lib.dish(dish).id),
  };
};

export const neverAt = (dish: string, where: { meals?: Meal[]; days?: Day[] }): PlanExpectation => {
  const at = [where.meals && `at ${list(where.meals)}`, where.days && `on ${list(where.days)}`].filter(Boolean).join(' ');
  const hit = (s: PlanSlotLike, id: number) =>
    idsOf(s).includes(id) && (!where.meals || where.meals.includes(s.meal_slot)) && (!where.days || where.days.includes(s.day));
  return {
    says: `${dish} is never planned ${at}`,
    check: (w) => {
      const id = w.lib.dish(dish).id;
      const n = slotsOf(w).filter((s) => hit(s, id)).length;
      return { pass: n === 0, got: `${n} meals` };
    },
  };
};

export const noHardProblems = (): PlanExpectation => ({
  says: 'No hard rule is broken',
  check: (w) => {
    const n = w.hard.flat().length;
    return { pass: n === 0, got: n === 0 ? 'none' : `${n} broken` };
  },
});

export const lockedMealKept = (key: `${Day}-${Meal}`, part: 'curry' | 'subzi' | 'base', dish: string): PlanExpectation => ({
  says: `The locked ${key.replace('-', ' ')} keeps ${dish} as its ${part}`,
  check: (w) => {
    const id = w.lib.dish(dish).id;
    const [day, meal] = key.split('-');
    const field = { base: 'base_id', curry: 'curry_id', subzi: 'subzi_id' }[part] as 'base_id' | 'curry_id' | 'subzi_id';
    const k = w.weeks.filter((wk) => wk.find((s) => s.day === day && s.meal_slot === meal)?.[field] === id).length;
    return { pass: k === w.weeks.length, got: `${k} of ${w.weeks.length}` };
  },
});

export const nearNoRulesCount = (dish: string): PlanExpectation => ({
  says: `${dish} is planned about as often as without the case's rules`,
  check: (w, ctx) => {
    const id = w.lib.dish(dish).id;
    const total = countOf(w, id);
    const base = countOf(ctx.baseline(), id);
    const pass = base < 4 ? total >= 4 : total >= base / 1.5 && total <= base * 1.5;
    return { pass, got: `${total} (${base} without the rules)` };
  },
});
