// Expectation helpers: each is a sentence with a check over the planned weeks.
import type { Day, Meal, PartSlot } from '@/planner';
import type { PlanSlot } from '@/types/plan';
import type { CaseLibrary, CaseWeeks, PlanExpectation } from './types';

export const idsOf = (s: PlanSlot): number[] =>
  [s.base_id, s.curry_id, s.subzi_id, ...s.extra_ids].filter((x): x is number => x !== undefined);
/** The weeks in today's shape. A case with its own library has part-keyed weeks (`w.parts`) these helpers cannot read. */
const legacyWeeks = (w: CaseWeeks): PlanSlot[][] => {
  if (w.parts) throw new Error('this expectation reads weeks in the converted shape; a case with its own library needs part-keyed expectations');
  return w.weeks;
};
const slotsOf = (w: CaseWeeks): PlanSlot[] => legacyWeeks(w).flat();
const countOf = (w: CaseWeeks, dishId: number): number => slotsOf(w).filter((s) => idsOf(s).includes(dishId)).length;
const times = (n: number) => (n === 1 ? '1 time' : `${n} times`);
export const mealCount = (n: number) => (n === 1 ? '1 meal' : `${n} meals`);
const list = (xs: string[], word = 'and') => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${word} ${xs[xs.length - 1]}`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** The first week (index) in which `bad` holds, for the report's sample week. */
const firstWeek = (w: CaseWeeks, bad: (week: PlanSlot[], i: number) => boolean): number | undefined => {
  const i = legacyWeeks(w).findIndex(bad);
  return i < 0 ? undefined : i;
};

/** The dish ids a part-keyed meal holds in a part (none when the part is empty). */
export const partDishes = (slot: PartSlot, partId: number): number[] => slot.parts[partId] ?? [];

/**
 * Over the meals of a library with its own parts: some meals match `where`, and every one of them also matches `then`.
 * `highlights` is left out: a part-keyed meal is not a converted slot.
 */
export const everyPartMeal = (says: string, where: (s: PartSlot) => boolean, then: (s: PartSlot) => boolean): PlanExpectation => {
  const weeksOf = (w: CaseWeeks): PartSlot[][] => {
    if (!w.parts) throw new Error('everyPartMeal reads part-keyed weeks; the case needs its own library');
    return w.parts;
  };
  return {
    says,
    check: (w) => {
      const meals = weeksOf(w).flat().filter(where);
      const k = meals.filter(then).length;
      return { pass: meals.length > 0 && k === meals.length, got: `${k} of ${meals.length}` };
    },
    failingSeed: (w) => {
      const i = weeksOf(w).findIndex((wk) => wk.some((s) => where(s) && !then(s)));
      return i < 0 ? undefined : i;
    },
  };
};

/** The planner named a rule it left out: `text` appears in the rule's name or message. */
export const ruleIssueNamed = (text: string): PlanExpectation => ({
  says: `A rule left out of the plan is named: ${text}`,
  check: (w) => {
    const names = (w.issues ?? []).map((i) => `${i.name}: ${i.message}`);
    return { pass: names.some((n) => n.includes(text)), got: names.length ? names.join('; ') : 'no rule issue' };
  },
});

/** Every meal of a library with its own parts holds all these dish ids in the part. */
export const everyMealHasInPart = (partId: number, ids: number[], partName = `part ${partId}`): PlanExpectation => {
  const lacks = (s: PartSlot) => !ids.every((id) => partDishes(s, partId).includes(id));
  const weeksOf = (w: CaseWeeks): PartSlot[][] => {
    if (!w.parts) throw new Error('everyMealHasInPart reads part-keyed weeks; the case needs its own library');
    return w.parts;
  };
  return {
    says: `Every meal has ${ids.length === 1 ? 'dish' : 'dishes'} ${list(ids.map(String))} in ${partName}`,
    check: (w) => {
      const meals = weeksOf(w).flat();
      const k = meals.filter((s) => !lacks(s)).length;
      return { pass: meals.length > 0 && k === meals.length, got: `${k} of ${meals.length}` };
    },
    failingSeed: (w) => {
      const i = weeksOf(w).findIndex((wk) => wk.some(lacks));
      return i < 0 ? undefined : i;
    },
  };
};

export const plannedAtLeast = (dish: string, n: number): PlanExpectation => ({
  says: `${dish} is planned at least ${times(n)} over the 8 weeks`,
  check: (w) => {
    const got = countOf(w, w.lib.dish(dish).id);
    return { pass: got >= n, got: times(got) };
  },
});

export const plannedBetween = (dish: string, min: number, max: number): PlanExpectation => ({
  says: `${dish} is planned between ${min} and ${max} times over the 8 weeks`,
  check: (w) => {
    const got = countOf(w, w.lib.dish(dish).id);
    return { pass: got >= min && got <= max, got: times(got) };
  },
  highlights: (slot, lib) => idsOf(slot).includes(lib.dish(dish).id),
});

export const everyMealWith = (dish: string, alsoHas: string[]): PlanExpectation => ({
  says: `Every ${dish} meal has ${list(alsoHas)}`,
  check: (w) => {
    const id = w.lib.dish(dish).id;
    const need = alsoHas.map((n) => w.lib.dish(n).id);
    const meals = slotsOf(w).filter((s) => idsOf(s).includes(id));
    const k = meals.filter((s) => need.every((n) => idsOf(s).includes(n))).length;
    return { pass: meals.length > 0 && k === meals.length, got: `${k} of ${meals.length}` };
  },
  failingSeed: (w) => {
    const id = w.lib.dish(dish).id;
    const need = alsoHas.map((n) => w.lib.dish(n).id);
    return firstWeek(w, (wk) => wk.some((s) => idsOf(s).includes(id) && !need.every((n) => idsOf(s).includes(n))));
  },
  highlights: (slot, lib) => idsOf(slot).includes(lib.dish(dish).id),
});

/** Some meal of the dish at one of these meals has the others: the pairing reaches beyond the side's own meals. */
export const someMealWith = (dish: string, alsoHas: string[], at: Meal[]): PlanExpectation => ({
  says: `Some ${dish} meal at ${list(at, 'or')} has ${list(alsoHas)}`,
  check: (w) => {
    const id = w.lib.dish(dish).id;
    const need = alsoHas.map((n) => w.lib.dish(n).id);
    const found = slotsOf(w).filter((s) => at.includes(s.meal_slot) && idsOf(s).includes(id));
    const k = found.filter((s) => need.every((n) => idsOf(s).includes(n))).length;
    return { pass: k > 0, got: `${k} of ${found.length} ${dish} ${at.join(' and ')} meals` };
  },
  highlights: (slot, lib) => at.includes(slot.meal_slot) && idsOf(slot).includes(lib.dish(dish).id),
});

/** Every meal of the dish except one locked meal has the others. */
export const everyOtherMealWith = (dish: string, alsoHas: string[], except: `${Day}-${Meal}`): PlanExpectation => {
  const [day, meal] = except.split('-');
  const others = (w: CaseWeeks, wk: PlanSlot[]) =>
    wk.filter((s) => idsOf(s).includes(w.lib.dish(dish).id) && !(s.day === day && s.meal_slot === meal));
  const lacks = (w: CaseWeeks, s: PlanSlot) => !alsoHas.every((n) => idsOf(s).includes(w.lib.dish(n).id));
  return {
    says: `Every other ${dish} meal (not the locked ${cap(except.replace('-', ' '))}) has ${list(alsoHas)}`,
    check: (w) => {
      const all = legacyWeeks(w).flatMap((wk) => others(w, wk));
      const k = all.filter((s) => !lacks(w, s)).length;
      return { pass: all.length > 0 && k === all.length, got: `${k} of ${all.length}` };
    },
    failingSeed: (w) => firstWeek(w, (wk) => others(w, wk).some((s) => lacks(w, s))),
    highlights: (slot, lib) => idsOf(slot).includes(lib.dish(dish).id) && !(slot.day === day && slot.meal_slot === meal),
  };
};

/** The dish's Always pairing is left out of the meal because the other dish's pairing already holds the curry. */
export const yieldsTo = (dish: string, holder: string): PlanExpectation => {
  const left = (w: CaseWeeks, wk: number) =>
    w.suppressed[wk].filter((j) => j.label.startsWith(`${dish}:`) && j.suppressed?.heldBy === w.lib.dish(holder).id).length;
  return {
    says: `${dish}'s pairing is reported as left out in favour of ${holder}'s in every week`,
    check: (w) => {
      const k = legacyWeeks(w).filter((_, i) => left(w, i) > 0).length;
      return { pass: k === legacyWeeks(w).length, got: `${k} of ${legacyWeeks(w).length} weeks` };
    },
    failingSeed: (w) => firstWeek(w, (_, i) => left(w, i) === 0),
  };
};

export const neverWith = (dish: string, other: string): PlanExpectation => ({
  says: `${dish} is never planned with ${other}`,
  check: (w) => {
    const a = w.lib.dish(dish).id;
    const b = w.lib.dish(other).id;
    const n = slotsOf(w).filter((s) => idsOf(s).includes(a) && idsOf(s).includes(b)).length;
    return { pass: n === 0, got: mealCount(n) };
  },
  failingSeed: (w) => firstWeek(w, (wk) => wk.some((s) => idsOf(s).includes(w.lib.dish(dish).id) && idsOf(s).includes(w.lib.dish(other).id))),
  highlights: (slot, lib) => idsOf(slot).includes(lib.dish(dish).id) || idsOf(slot).includes(lib.dish(other).id),
});

export const neverAt = (dish: string, where: { meals?: Meal[]; days?: Day[] }): PlanExpectation => {
  if (!where.meals?.length && !where.days?.length) throw new Error('neverAt needs meals or days');
  const at = [where.meals && `at ${list(where.meals, 'or')}`, where.days && `on ${list(where.days, 'or')}`].filter(Boolean).join(' ');
  const hit = (s: PlanSlot, id: number) =>
    idsOf(s).includes(id) && (!where.meals || where.meals.includes(s.meal_slot)) && (!where.days || where.days.includes(s.day));
  return {
    says: `${dish} is never planned ${at}`,
    check: (w) => {
      const id = w.lib.dish(dish).id;
      const n = slotsOf(w).filter((s) => hit(s, id)).length;
      return { pass: n === 0, got: mealCount(n) };
    },
    failingSeed: (w) => firstWeek(w, (wk) => wk.some((s) => hit(s, w.lib.dish(dish).id))),
    // The dish wherever it is planned, so the sample week shows what the rule keeps out of the scope.
    highlights: (slot, lib) => idsOf(slot).includes(lib.dish(dish).id),
  };
};

export const noHardProblems = (): PlanExpectation => ({
  says: 'No hard rule is broken',
  check: (w) => {
    const n = w.hard.flat().length;
    return { pass: n === 0, got: n === 0 ? 'none' : `${n} broken` };
  },
  failingSeed: (w) => {
    const i = w.hard.findIndex((h) => h.length > 0);
    return i < 0 ? undefined : i;
  },
});

export const lockedMealKept = (key: `${Day}-${Meal}`, part: 'curry' | 'subzi' | 'base', dish: string): PlanExpectation => {
  const [day, meal] = key.split('-');
  const field = { base: 'base_id', curry: 'curry_id', subzi: 'subzi_id' }[part] as 'base_id' | 'curry_id' | 'subzi_id';
  return {
    says: `The locked ${cap(key.replace('-', ' '))} keeps ${dish} as its ${part}`,
    check: (w) => {
      const id = w.lib.dish(dish).id;
      const k = legacyWeeks(w).filter((wk) => wk.find((s) => s.day === day && s.meal_slot === meal)?.[field] === id).length;
      return { pass: k === legacyWeeks(w).length, got: `${k} of ${legacyWeeks(w).length}` };
    },
    failingSeed: (w) => firstWeek(w, (wk) => wk.find((s) => s.day === day && s.meal_slot === meal)?.[field] !== w.lib.dish(dish).id),
  };
};

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

/** The dish is planned at least about as often as without the case's rules (more often is fine). */
export const notRarerThanNoRules = (dish: string): PlanExpectation => ({
  says: `${dish} is planned at least about as often as without the case's rules`,
  check: (w, ctx) => {
    const id = w.lib.dish(dish).id;
    const total = countOf(w, id);
    const base = countOf(ctx.baseline(), id);
    const pass = base < 4 ? total >= 4 : total >= base / 1.5;
    return { pass, got: `${total} (${base} without the rules)` };
  },
});

/** Every meal of the dish has at least one of these other dishes. */
export const everyMealWithOneOf = (dish: string, oneOf: string[]): PlanExpectation => {
  const lacks = (w: CaseWeeks, s: PlanSlot) => !oneOf.some((n) => idsOf(s).includes(w.lib.dish(n).id));
  const mine = (w: CaseWeeks, s: PlanSlot) => idsOf(s).includes(w.lib.dish(dish).id);
  return {
    says: `Every ${dish} meal has ${list(oneOf, 'or')}`,
    check: (w) => {
      const meals = slotsOf(w).filter((s) => mine(w, s));
      const k = meals.filter((s) => !lacks(w, s)).length;
      return { pass: meals.length > 0 && k === meals.length, got: `${k} of ${meals.length}` };
    },
    failingSeed: (w) => firstWeek(w, (wk) => wk.some((s) => mine(w, s) && lacks(w, s))),
    highlights: (slot, lib) => idsOf(slot).includes(lib.dish(dish).id),
  };
};

/** Each of the dishes is planned with the partner in at least one meal. */
export const eachPlanned = (names: string[], partner: string): PlanExpectation => ({
  says: `Each of ${list(names)} is planned with ${partner} at least once`,
  check: (w) => {
    const p = w.lib.dish(partner).id;
    const missing = names.filter((n) => {
      const id = w.lib.dish(n).id;
      return !slotsOf(w).some((s) => idsOf(s).includes(id) && idsOf(s).includes(p));
    });
    return { pass: missing.length === 0, got: missing.length === 0 ? 'all of them' : `never with ${partner}: ${list(missing)}` };
  },
  highlights: (slot, lib) => idsOf(slot).includes(lib.dish(partner).id),
});

/** Which meals an expectation looks at. */
export type Pick = (s: PlanSlot, lib: CaseLibrary) => boolean;
export const mealsPicked = (w: CaseWeeks, pick: Pick): PlanSlot[] => legacyWeeks(w).flat().filter((s) => pick(s, w.lib));

/** A check over the meals `where` picks: `pass` gets the count that also satisfy `then` and the meals picked. */
const overPicked = (says: string, where: Pick, then: Pick, pass: (k: number, n: number) => boolean): PlanExpectation => ({
  says,
  check: (w) => {
    const meals = mealsPicked(w, where);
    const k = meals.filter((s) => then(s, w.lib)).length;
    return { pass: meals.length > 0 && pass(k, meals.length), got: `${k} of ${meals.length}` };
  },
  highlights: (slot, lib) => where(slot, lib),
});

/** Every meal `where` picks also satisfies `then`; at least one meal is picked. */
export const everyPicked = (says: string, where: Pick, then: Pick): PlanExpectation => overPicked(says, where, then, (k, n) => k === n);
/** No meal `where` picks satisfies `then`; at least one meal is picked, so the check is not empty. */
export const nonePicked = (says: string, where: Pick, then: Pick): PlanExpectation => overPicked(says, where, then, (k) => k === 0);
/** At least `num` of every `den` picked meals satisfy `then`. */
export const mostPicked = (says: string, where: Pick, then: Pick, num: number, den: number): PlanExpectation =>
  overPicked(says, where, then, (k, n) => k * den >= n * num);
/** At least `min` meals are picked. */
export const atLeastPicked = (says: string, where: Pick, min: number): PlanExpectation => ({
  says,
  check: (w) => {
    const n = mealsPicked(w, where).length;
    return { pass: n >= min, got: `${n}` };
  },
  highlights: (slot, lib) => where(slot, lib),
});
/** Some week has more than `over` picked meals. */
export const someWeekPicks = (says: string, where: Pick, over: number): PlanExpectation => ({
  says,
  check: (w) => {
    const counts = legacyWeeks(w).map((wk) => wk.filter((s) => where(s, w.lib)).length);
    return { pass: counts.some((c) => c > over), got: `weekly counts ${counts.join(', ')}` };
  },
  highlights: (slot, lib) => where(slot, lib),
});
