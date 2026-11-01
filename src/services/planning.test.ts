import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { runSeed } from '@/db/seed';
import { is } from '@/planner';
import { linkRule } from '@/rules';
import { addRule } from '@/services/food-db';
import { planFromData, slotConflicts } from './plan-generation';
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
      expect.objectContaining({
        day: 'monday', meal: 'breakfast', reason: 'Never include Idli', message: 'Never include Idli — Monday breakfast',
      }),
    ]);
    expect(outcome.ruleIssues).toEqual([
      expect.objectContaining({ name: 'Ghost rule', message: 'refers to component #4242, which no longer exists' }),
    ]);
  });

  it('applies the seeded per-meal extras limit, an ordinary rule the user can change', async () => {
    await runSeed();
    const lunchLimit = (await db.rules.toArray()).find((r) => r.name === 'Extras at lunch: at most 3')!;
    await db.rules.update(lunchLimit.id, {
      name: 'Extras at lunch: at most 1',
      spec: { template: 'limit', params: { match: is('componentType', 'extra'), per: 'meal', max: 1, scope: { meals: ['lunch'] }, strength: 'must' } },
    });
    const input = await loadPlanningInput();
    const extras = input.library.filter((c) => c.componentType === 'extra').map((c) => c.id);
    const outcome = planFromData(input, { seed: 4, pins: { 'monday-lunch': { extra_ids: extras.slice(0, 2) } } });
    expect(outcome.problems).toContainEqual(expect.objectContaining({ level: 'hard', day: 'monday', meal: 'lunch', reason: 'Extras: at most 1 per meal at lunch', message: 'Extras: at most 1 per meal at lunch — Monday lunch' }));
  });
});

describe('sides', () => {
  it('leaves curries, subzis and extras out unless a rule asks for them', async () => {
    await runSeed();
    for (const seed of [1, 2]) {
      const { plan } = await generatePlan({ seed });
      expect(plan.slots.filter((s) => s.curry_id || s.subzi_id || s.extra_ids.length)).toEqual([]);
    }
  });

  it('adds the sides a rule asks for, and only those', async () => {
    await runSeed();
    const library = await db.components.toArray();
    const dosa = library.find((c) => c.name === 'Dosa')!;
    const sambar = library.find((c) => c.name === 'Sambar')!;
    await addRule({ name: 'Sambar with Dosa', enabled: true, created_at: '', spec: { template: 'require_with', params: { when: is('id', dosa.id), components: [sambar.id], strength: 'must' } } });

    const { plan } = await generatePlan({ seed: 1, pins: { 'monday-breakfast': { base_id: dosa.id } } });
    for (const slot of plan.slots) {
      if (slot.base_id === dosa.id) expect(slot.curry_id).toBe(sambar.id);
      else expect(slot.curry_id).toBeUndefined();
      expect(slot.subzi_id).toBeUndefined();
      expect(slot.extra_ids).toEqual([]);
    }
  });
});

describe('served with', () => {
  it('adds a dish to every meal whose base it is served with', async () => {
    await runSeed();
    const library = await db.components.toArray();
    const dosa = library.find((c) => c.name === 'Dosa')!;
    const sambar = library.find((c) => c.name === 'Sambar')!;
    await db.rules.add({ ...linkRule(sambar, { mode: 'serve', target: 'base_dish', values: [dosa.id] }), enabled: true, created_at: '' });

    const { plan } = await generatePlan({ seed: 1, pins: { 'monday-breakfast': { base_id: dosa.id } } });
    const dosaMeals = plan.slots.filter((s) => s.base_id === dosa.id);
    expect(dosaMeals.length).toBeGreaterThan(0);
    for (const slot of dosaMeals) expect(slot.curry_id).toBe(sambar.id);
  });
});

describe('links to specific dishes', () => {
  it('plans a curry only with the chosen bases and never with the chosen extra', async () => {
    await runSeed();
    const input = await loadPlanningInput();
    const byType = (t: string) => input.library.filter((c) => c.componentType === t);
    const curry = byType('curry')[0];
    const [onlyBase] = byType('base');
    const [avoided] = byType('extra');
    const now = new Date().toISOString();
    for (const rule of [linkRule(curry, { mode: 'with', target: 'base_dish', values: [onlyBase.id] }), linkRule(curry, { mode: 'never', target: 'extra_dish', values: [avoided.id] })]) {
      await db.rules.add({ ...rule, enabled: true, created_at: now });
    }
    // Sides are left out unless a rule asks for them, so ask for this curry wherever it fits.
    await addRule({ name: 'This curry when it fits', enabled: true, created_at: now, spec: { template: 'require', params: { match: is('id', curry.id), strength: 'prefer' } } });

    let seen = 0;
    for (const seed of [1, 2, 3]) {
      const { plan, problems } = await generatePlan({ seed });
      expect(problems.filter((p) => p.level === 'hard')).toEqual([]);
      const withCurry = plan.slots.filter((s) => s.curry_id === curry.id);
      seen += withCurry.length;
      for (const slot of withCurry) {
        expect(slot.base_id).toBe(onlyBase.id);
        expect(slot.extra_ids).not.toContain(avoided.id);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('slotConflicts', () => {
  it('reports the rules a choice would break in one slot, leaving choices that fit out', async () => {
    await runSeed();
    const input = await loadPlanningInput();
    const { plan } = planFromData(input, { seed: 1 });
    const byName = (name: string) => input.library.find((c) => c.name === name)!.id;
    const riceId = input.categories.find((c) => c.name === 'rice-based')!.id;
    const riceLunch = plan.slots.find((s) => s.meal_slot === 'lunch'
      && input.library.find((c) => c.id === s.base_id)?.base_category_id === riceId)!;

    const conflicts = slotConflicts(input, plan, riceLunch.day, 'lunch', 'curry', [byName('Sambar'), byName('Chole'), byName('Rasam')]);

    expect([...conflicts.keys()]).toEqual([byName('Chole'), byName('Rasam')]);
    expect(conflicts.get(byName('Chole'))).toEqual([
      expect.objectContaining({ level: 'hard', day: riceLunch.day, meal: 'lunch', reason: expect.stringMatching(/^Chole only with .*bases$/) }),
    ]);
  });

  it('explains problems in words: no counting jargon, categories by name, built-ins by label', async () => {
    await runSeed();
    const input = await loadPlanningInput();
    const { plan } = planFromData(input, { seed: 1 });
    const chole = input.library.find((c) => c.name === 'Chole')!.id;
    const riceLunch = plan.slots.find((s) => s.meal_slot === 'lunch' && input.library.find((c) => c.id === s.base_id)?.base_category_id === input.categories.find((c) => c.name === 'rice-based')!.id)!;
    const reasons = slotConflicts(input, plan, riceLunch.day, 'lunch', 'curry', [chole]).get(chole)!.map((p) => p.reason);
    expect(reasons).toEqual(['Chole only with bread-based bases']);

    const broken = planFromData(input, { seed: 2, pins: { 'monday-lunch': { curry_id: input.library.filter((c) => c.componentType === 'curry')[0].id, subzi_id: input.library.find((c) => c.componentType === 'base')!.id } } });
    const builtin = broken.problems.find((p) => p.reason === 'Component used in the wrong role');
    expect(builtin?.message).toContain('has 1, must be at most 0');
    for (const p of broken.problems.filter((p) => p.ruleId !== undefined)) expect(p.message, p.reason).not.toMatch(/must be|should be|has \d/);
  });
});
