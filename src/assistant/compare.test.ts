import { describe, expect, it } from 'vitest';
import { is, TRUE, type Pins } from '@/planner';
import type { RuleSpecInput } from '@/rules';
import { planFromData, type PlanningInput, type PlanningOptions } from '@/services/plan-generation';
import type { ComponentRecord } from '@/types/component';
import { COMPARE_SEED, makeCompare } from './compare';

const dish = (id: number, name: string, componentType: string): ComponentRecord =>
  ({ id, name, componentType, dietary_tags: ['veg'], regional_tags: [], occasion_tags: [], created_at: '' } as ComponentRecord);
const library = [dish(1, 'Pulao', 'base'), dish(2, 'Paneer', 'curry'), dish(3, 'Dal', 'curry'), dish(4, 'Rajma', 'curry')];
const data = { library, categories: [], rules: [] };
const run = async (input: PlanningInput, opts: PlanningOptions) => planFromData(input, opts);
const exclude = (match: unknown) => ({ template: 'exclude', params: { match } }) as unknown as RuleSpecInput;

describe('makeCompare', () => {
  it('moves an excluded dish out and flags the changed slots as touched by the rule', async () => {
    const c = await makeCompare(data, undefined, run)(exclude(is('id', 2)), 'No paneer');
    const paneerBefore = c.before.slots.filter((s) => s.curry_id === 2 || s.subzi_id === 2).length;
    expect(paneerBefore).toBeGreaterThan(0);
    expect(c.after.slots.some((s) => s.curry_id === 2 || s.subzi_id === 2)).toBe(false);
    expect(c.changes.length).toBeGreaterThan(0);
    const removed = c.changes.filter((x) => x.before.includes('Paneer') && !x.after.includes('Paneer'));
    expect(removed.length).toBeGreaterThan(0);
    expect(removed.every((x) => x.touchedByRule)).toBe(true);
    expect(c.identical).toBe(false);
    expect(c.worse).toBe(false);
  });

  it('reports identical when the draft matches nothing', async () => {
    const c = await makeCompare(data, undefined, run)(exclude(is('id', 999)), 'Nothing');
    expect(c.identical).toBe(true);
    expect(c.changes).toEqual([]);
    expect(c.worse).toBe(false);
  });

  it('reports worse, with the new hard problems, when the draft cannot be met', async () => {
    const c = await makeCompare(data, undefined, run)(exclude(TRUE), 'No food');
    expect(c.worse).toBe(true);
    expect(c.newHardProblems.length).toBeGreaterThan(0);
    expect(c.newHardProblems.every((p) => p.level === 'hard')).toBe(true);
  });

  it('runs both plans with the same seed and pins, and the draft only in the second', async () => {
    const calls: { input: PlanningInput; opts: PlanningOptions }[] = [];
    const spy = async (input: PlanningInput, opts: PlanningOptions) => { calls.push({ input, opts }); return planFromData(input, opts); };
    const pins: Pins = { 'monday-lunch': { base_id: 1 } };
    await makeCompare(data, pins, spy)(exclude(is('id', 2)), 'No paneer');
    expect(calls).toHaveLength(2);
    expect(calls[0].opts).toEqual({ seed: COMPARE_SEED, pins });
    expect(calls[1].opts).toEqual({ seed: COMPARE_SEED, pins });
    expect(calls[0].input.rules).toHaveLength(0);
    expect(calls[1].input.rules).toEqual([expect.objectContaining({ id: -1, enabled: true, name: 'No paneer' })]);
  });
});
