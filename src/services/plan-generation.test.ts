import { describe, expect, it } from 'vitest';
import { dayRule, linkRule, type RuleRecord } from '@/rules';
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
});
