import { describe, expect, it } from 'vitest';
import { is } from '@/planner';
import { dayRule, defaultRules, exclusionRule, linkRule, type RuleRecord } from '@/rules';
import type { ComponentRecord } from '@/types/component';
import type { PlanSlot, WeeklyPlan } from '@/types/plan';
import { diffPlans, explainPlan, missingDishIds, planFromData, slotConflicts, type PlanningInput } from './plan-generation';

const dish = (id: number, name: string, componentType: string): ComponentRecord =>
  ({ id, name, componentType, dietary_tags: ['veg'], regional_tags: [], occasion_tags: [], created_at: '' } as ComponentRecord);

const pulao = dish(1, 'Pulao', 'base');
const input = (rules: RuleRecord[] = []): PlanningInput => ({ library: [pulao], categories: [], rules });
const planOf = (...slots: Partial<PlanSlot>[]): WeeklyPlan => ({
  slots: slots.map((s) => ({ day: 'monday', meal_slot: 'lunch', base_id: 1, extra_ids: [], ...s })),
});

describe('explainPlan', () => {
  it('reports a stored plan breaking a current rule, located by day and rule', () => {
    const owned = dayRule(pulao, ['tuesday']);
    const rule: RuleRecord = { id: 7, name: owned.name, spec: owned.spec, enabled: true, created_at: '' };
    const problems = explainPlan(input([rule]), planOf({ day: 'monday', meal_slot: 'lunch' }));
    expect(problems).toContainEqual(expect.objectContaining({ level: 'hard', day: 'monday', ruleId: 7 }));
  });

  it('finds nothing wrong with a plan that breaks no rule', () => {
    const rule: RuleRecord = { id: 7, name: 'x', spec: dayRule(pulao, ['monday']).spec, enabled: true, created_at: '' };
    expect(explainPlan(input([rule]), planOf({})).filter((p) => p.ruleId === 7)).toEqual([]);
  });

  it('does not throw when the plan references a deleted dish', () => {
    const plan = planOf({ base_id: 99, curry_id: 98, extra_ids: [97] });
    expect(() => explainPlan(input(), plan)).not.toThrow();
    expect(missingDishIds(input(), plan)).toEqual([97, 98, 99]);
  });
});

describe('diffPlans', () => {
  const names = new Map([[1, 'Pulao'], [2, 'Paneer'], [3, 'Dal']]);

  it('is empty for equal plans', () => {
    const p = planOf({ curry_id: 2 });
    expect(diffPlans(p, structuredClone(p), names)).toEqual([]);
  });

  it('lists changed slots with dish names and flags those touching the predicate', () => {
    const before = planOf({ curry_id: 2 }, { day: 'tuesday', curry_id: 3 });
    const after = planOf({ curry_id: 3 }, { day: 'tuesday', curry_id: 3 });
    const changes = diffPlans(before, after, names, (id) => id === 2);
    expect(changes).toEqual([{ day: 'monday', meal: 'lunch', before: 'Pulao + Paneer', after: 'Pulao + Dal', touchedByRule: true }]);
    expect(diffPlans(before, after, names)[0].touchedByRule).toBe(false);
  });
});

describe('pairings', () => {
  const pongal = dish(10, 'Pongal', 'base');
  const sambar = dish(11, 'Sambar', 'curry');
  const rasam = dish(12, 'Rasam', 'curry');
  const owned = linkRule(sambar, { mode: 'serve', target: 'base_dish', values: [10], strength: 'always' });
  const rule: RuleRecord = { id: 5, name: owned.name, spec: owned.spec, enabled: true, created_at: '', owner_component_id: 11 } as RuleRecord;
  const data: PlanningInput = { library: [pongal, sambar, rasam], categories: [], rules: [rule] };

  it('does not count the paired side against a base that brings it', () => {
    const plan = planOf({ day: 'monday', meal_slot: 'breakfast', base_id: 10 });
    expect(slotConflicts(data, plan, 'monday', 'breakfast', 'base', [10]).get(10)).toBeUndefined();
  });

  describe('the meal picker replacing a base that brought its sides', () => {
    const idli = dish(13, 'Idli', 'base');
    const never = exclusionRule(sambar);
    const neverAuto: RuleRecord = { id: 6, name: never.name, spec: never.spec, enabled: true, created_at: '', owner_component_id: 11 } as RuleRecord;
    const idliNeverWith = (curry: number, id: number): RuleRecord =>
      ({ id, name: `Idli never with ${curry}`, spec: { template: 'avoid_with', params: { match: is('id', 13), with: is('id', curry), strength: 'must' } }, enabled: true, created_at: '' });
    const picker = (rules: RuleRecord[], curry: number) => slotConflicts(
      { library: [pongal, sambar, rasam, idli], categories: [], rules: [rule, neverAuto, ...rules] },
      planOf({ day: 'monday', meal_slot: 'breakfast', base_id: 10, curry_id: curry }),
      'monday', 'breakfast', 'base', [13],
    );

    it("judges a candidate base without the sides the replaced base brought (Sambar's own rules are not its problem)", () => {
      expect(picker([], 11).get(13)).toBeUndefined();
      expect(picker([idliNeverWith(11, 7)], 11).get(13)).toBeUndefined();
    });

    it('keeps a side the replaced base did not bring', () => {
      expect(picker([idliNeverWith(12, 7)], 12).get(13)?.map((p) => p.ruleId)).toEqual([7]);
    });
  });

  describe('a stored conflict (a second Always curry for Pongal)', () => {
    const rasamLink = linkRule(rasam, { mode: 'serve', target: 'base_dish', values: [10], strength: 'always' });
    const rasamRule: RuleRecord = { id: 8, name: rasamLink.name, spec: rasamLink.spec, enabled: true, created_at: '', owner_component_id: 12 } as RuleRecord;
    const conflicted: PlanningInput = { library: [pongal, sambar, rasam], categories: [], rules: [rule, rasamRule] };
    const reason = 'Rasam is not served with Pongal: a meal holds one curry and Sambar is always served with it.';

    it('is reported once, as one soft problem worded as the conflict, not per meal', () => {
      const out = planFromData(conflicted, { seed: 3 });
      expect(out.plan.slots.filter((s) => s.base_id === 10).length).toBeGreaterThan(1);
      const rasamProblems = out.problems.filter((p) => p.ruleId === 8);
      expect(rasamProblems).toHaveLength(1);
      expect(rasamProblems[0]).toMatchObject({ level: 'soft', reason, message: reason });
      expect(rasamProblems[0].day).toBeUndefined();
      expect(rasamProblems[0].meal).toBeUndefined();
      // It belongs to the Pongal meals only.
      const pongalMeals = out.plan.slots.filter((s) => s.base_id === 10).map((s) => ({ day: s.day, meal: s.meal_slot }));
      expect(rasamProblems[0].slots).toEqual(expect.arrayContaining(pongalMeals));
      expect(rasamProblems[0].slots).toHaveLength(pongalMeals.length);
    });

    it('names the dish the holding curry is served with when that is not the dish that asked', () => {
      const chutney = dish(14, 'Chutney', 'extra');
      const withChutney: RuleRecord = {
        id: 9, name: 'Chutney with Rasam', enabled: true, created_at: '',
        spec: { template: 'require_with', params: { when: is('id', 14), components: [12], strength: 'must' } },
      } as RuleRecord;
      const plan = planOf({ day: 'monday', meal_slot: 'breakfast', base_id: 10, curry_id: 11, extra_ids: [14] });
      const problems = explainPlan({ library: [pongal, sambar, rasam, chutney], categories: [], rules: [rule, withChutney] }, plan);
      expect(problems.filter((p) => p.ruleId === 9).map((p) => p.reason)).toEqual([
        'Rasam is not served with Chutney: a meal holds one curry and Sambar is always served with Pongal.',
      ]);
    });

    it('explainPlan reports it once as well', () => {
      const plan = planOf(
        { day: 'monday', meal_slot: 'breakfast', base_id: 10, curry_id: 11 },
        { day: 'tuesday', meal_slot: 'breakfast', base_id: 10, curry_id: 11 },
      );
      expect(explainPlan(conflicted, plan).filter((p) => p.ruleId === 8)).toEqual([
        { level: 'soft', reason, message: reason, ruleId: 8, slots: [{ day: 'monday', meal: 'breakfast' }, { day: 'tuesday', meal: 'breakfast' }] },
      ]);
    });
  });

  it('lists the paired sides present in each meal that holds the base', () => {
    const out = planFromData(data, { seed: 3 });
    const withPongal = out.plan.slots.filter((s) => s.base_id === 10);
    expect(withPongal.length).toBeGreaterThan(0);
    for (const s of withPongal) {
      expect(out.paired).toContainEqual({ day: s.day, meal: s.meal_slot, component: 11, by: 10 });
    }
    expect(out.paired.every((p) => p.component === 11 && p.by === 10)).toBe(true);
  });

  it('says a pair problem was replaced by the user\'s pick when that role was pinned', () => {
    const out = planFromData(data, {
      seed: 3,
      pins: { 'monday-breakfast': { base_id: 10, curry_id: 12 } },
    });
    const p = out.problems.find((x) => x.level === 'hard' && x.day === 'monday' && x.meal === 'breakfast' && x.ruleId === 5);
    expect(p).toBeDefined();
    expect(p!.message.endsWith('— replaced by your pick')).toBe(true);
  });

  describe('a comes-with link naming two stews', () => {
    const idiyappam = dish(20, 'Idiyappam', 'base');
    const stewVeg = dish(21, 'Kerala Stew (Veg)', 'curry');
    const stewNonVeg = dish(22, 'Kerala Stew (Non-Veg)', 'curry');
    const record = (id: number, owned: ReturnType<typeof linkRule>): RuleRecord =>
      ({ id, name: owned.name, spec: owned.spec, enabled: true, created_at: '', owner_component_id: owned.owner_component_id } as RuleRecord);

    it('a comes-with link replaced by a pin says so', () => {
      const comes = record(5, linkRule(idiyappam, { mode: 'comes', target: 'curry_dish', values: [21], strength: 'always' }));
      const out = planFromData({ library: [idiyappam, sambar, stewVeg, stewNonVeg], categories: [], rules: [comes] }, {
        seed: 3,
        pins: { 'monday-breakfast': { base_id: 20, curry_id: 11 } },
      });
      const p = out.problems.find((x) => x.level === 'hard' && x.day === 'monday' && x.meal === 'breakfast' && x.ruleId === 5);
      expect(p).toBeDefined();
      expect(p!.message.endsWith('— replaced by your pick')).toBe(true);
    });

    it('the meal picker brings the stew the rules allow', () => {
      const comes = record(5, linkRule(idiyappam, { mode: 'comes', target: 'curry_dish', values: [21, 22], strength: 'always' }));
      const notVeg: RuleRecord = {
        id: 6, name: 'Idiyappam never with Kerala Stew (Veg)', enabled: true, created_at: '',
        spec: { template: 'avoid_with', params: { match: is('id', 20), with: is('id', 21), strength: 'must' } },
      } as RuleRecord;
      const picker = slotConflicts(
        { library: [pongal, idiyappam, stewVeg, stewNonVeg], categories: [], rules: [comes, notVeg] },
        planOf({ day: 'monday', meal_slot: 'breakfast', base_id: 10 }),
        'monday', 'breakfast', 'base', [20],
      );
      expect(picker.get(20)).toBeUndefined();
    });

    it('the meal picker brings a stew with what that stew always comes with', () => {
      const papad = dish(23, 'Papad', 'extra');
      const comes = record(5, linkRule(idiyappam, { mode: 'comes', target: 'curry_dish', values: [21, 22], strength: 'always' }));
      const vegBrings = record(6, linkRule(stewVeg, { mode: 'comes', target: 'extra_dish', values: [23], strength: 'always' }));
      const notNonVeg: RuleRecord = {
        id: 7, name: 'Idiyappam never with Kerala Stew (Non-Veg)', enabled: true, created_at: '',
        spec: { template: 'avoid_with', params: { match: is('id', 20), with: is('id', 22), strength: 'must' } },
      } as RuleRecord;
      const picker = slotConflicts(
        { library: [pongal, idiyappam, stewVeg, stewNonVeg, papad], categories: [], rules: [comes, vegBrings, notNonVeg] },
        planOf({ day: 'monday', meal_slot: 'breakfast', base_id: 10 }),
        'monday', 'breakfast', 'base', [20],
      );
      expect(picker.get(20)).toBeUndefined();
    });

    it('the meal picker brings the frequent stew when both have been planned equally often', () => {
      // Idiyappam may hold neither stew, so both cost the same and the picker reports the one it brings.
      const comes = record(5, linkRule(idiyappam, { mode: 'comes', target: 'curry_dish', values: [21, 22], strength: 'always' }));
      const never = (id: number, stew: number): RuleRecord => ({
        id, name: `Idiyappam never with ${stew}`, enabled: true, created_at: '',
        spec: { template: 'avoid_with', params: { match: is('id', 20), with: is('id', stew), strength: 'must' } },
      } as RuleRecord);
      const frequency = defaultRules()
        .filter((r) => r.default_key === 'prefer-frequent' || r.default_key === 'avoid-rare')
        .map((r, k) => ({ ...r, id: 10 + k, enabled: true, created_at: '' } as RuleRecord));
      const picker = slotConflicts(
        { library: [pongal, idiyappam, stewVeg, { ...stewNonVeg, frequency: 'frequent' }], categories: [], rules: [comes, never(6, 21), never(7, 22), ...frequency] },
        planOf(
          { day: 'monday', meal_slot: 'breakfast', base_id: 10 },
          { day: 'thursday', meal_slot: 'lunch', base_id: 10, curry_id: 21 },
          { day: 'saturday', meal_slot: 'lunch', base_id: 10, curry_id: 22 },
        ),
        'monday', 'breakfast', 'base', [20],
      );
      expect(picker.get(20)?.map((p) => p.ruleId)).toEqual([7]);
    });

    it('a pairing it cannot hold names every stew', () => {
      const sambarWith = record(5, linkRule(sambar, { mode: 'serve', target: 'base_dish', values: [20], strength: 'always' }));
      const comes = record(8, linkRule(idiyappam, { mode: 'comes', target: 'curry_dish', values: [21, 22], strength: 'always' }));
      const plan = planOf({ day: 'monday', meal_slot: 'breakfast', base_id: 20, curry_id: 11 });
      const problems = explainPlan({ library: [idiyappam, sambar, stewVeg, stewNonVeg], categories: [], rules: [sambarWith, comes] }, plan);
      expect(problems.filter((p) => p.ruleId === 8).map((p) => p.reason)).toEqual([
        'Kerala Stew (Veg) or Kerala Stew (Non-Veg) is not served with Idiyappam: a meal holds one curry and Sambar is always served with it.',
      ]);
    });
  });
});
