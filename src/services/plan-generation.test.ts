import { describe, expect, it } from 'vitest';
import { dayRule, type RuleRecord } from '@/rules';
import type { ComponentRecord } from '@/types/component';
import type { PlanSlot, WeeklyPlan } from '@/types/plan';
import { explainPlan, missingDishIds, type PlanningInput } from './plan-generation';

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
