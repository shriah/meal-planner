import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { runSeed } from '@/db/seed';
import { is } from '@/planner';
import { addRule } from '@/services/food-db';
import { planFromData } from './plan-generation';
import { generatePlan, loadPlanningInput } from './planning';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('generatePlan (seeded database, in-thread)', () => {
  it('fills every meal and satisfies every seeded rule', async () => {
    await runSeed();
    const outcome = await generatePlan({ seed: 1 });

    expect(outcome.plan.slots).toHaveLength(21);
    expect(outcome.ruleIssues).toEqual([]);
    expect(outcome.problems.filter((p) => p.level === 'hard')).toEqual([]);

    // The seeded meal windows hold: rice-based bases only at lunch.
    const categories = await db.categories.toArray();
    const riceId = categories.find((c) => c.name === 'rice-based')!.id;
    const components = await db.components.toArray();
    const riceBases = new Set(components.filter((c) => c.base_category_id === riceId).map((c) => c.id));
    for (const slot of outcome.plan.slots.filter((s) => riceBases.has(s.base_id))) expect(slot.meal_slot).toBe('lunch');
  });

  it('keeps locked choices and plans around them', async () => {
    await runSeed();
    const idli = (await db.components.toArray()).find((c) => c.name === 'Idli')!;
    const outcome = await generatePlan({ seed: 2, pins: { 'friday-breakfast': { base_id: idli.id } } });
    expect(outcome.plan.slots.find((s) => s.day === 'friday' && s.meal_slot === 'breakfast')?.base_id).toBe(idli.id);
  });
});

describe('planFromData', () => {
  it('locates broken rules by meal, names components, and reports skipped rules', async () => {
    await runSeed();
    const components = await db.components.toArray();
    const idli = components.find((c) => c.name === 'Idli')!;
    await addRule({ name: 'No Idli', enabled: true, created_at: '', spec: { template: 'exclude', params: { match: is('id', idli.id) } } });
    await addRule({ name: 'Ghost rule', enabled: true, created_at: '', spec: { template: 'exclude', params: { match: is('id', 4242) } } });

    const outcome = planFromData(await loadPlanningInput(), { seed: 3, pins: { 'monday-breakfast': { base_id: idli.id } } });

    expect(outcome.problems.filter((p) => p.level === 'hard')).toEqual([
      expect.objectContaining({ day: 'monday', meal: 'breakfast', message: 'No Idli: on Monday breakfast has 1, must be at most 0' }),
    ]);
    expect(outcome.ruleIssues).toEqual([
      expect.objectContaining({ name: 'Ghost rule', message: 'refers to component #4242, which no longer exists' }),
    ]);
  });

  it('applies the per-meal extras limit from preferences', async () => {
    await runSeed();
    const input = await loadPlanningInput();
    const extras = input.library.filter((c) => c.componentType === 'extra').map((c) => c.id);
    const outcome = planFromData({ ...input, extraLimits: { breakfast: 1, lunch: 1, dinner: 1 } }, {
      seed: 4, pins: { 'monday-lunch': { extra_ids: extras.slice(0, 2) } },
    });
    expect(outcome.problems).toContainEqual(expect.objectContaining({ level: 'hard', day: 'monday', meal: 'lunch', message: expect.stringContaining('At most 1 extras at lunch') }));
  });
});
