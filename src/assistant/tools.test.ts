import { describe, expect, it } from 'vitest';
import { is } from '@/planner';
import type { RuleRecord } from '@/rules';
import type { ComponentRecord } from '@/types/component';
import { MAX_LIST_ITEMS } from './limits';
import type { AssistantData } from './retrieve';
import { TOOL_DECLARATIONS, problemsForSlot, runTool } from './tools';
import type { PlanProblem } from '@/services/plan-generation';
import { dayRule, linkRule, HAND_TEMPLATE_IDS } from '@/rules';
import { ALL_DAYS, type WeeklyPlan } from '@/types/plan';
import { MEALS } from '@/planner';
import type { ToolContext } from './types';

const dish = (id: number, name: string, extra: Partial<ComponentRecord> = {}): ComponentRecord =>
  ({ id, name, componentType: 'curry', dietary_tags: ['veg'], regional_tags: [], occasion_tags: [], notes: 'secret notes', created_at: '', ...extra } as ComponentRecord);
const rule = (id: number, componentId: number): RuleRecord =>
  ({ id, name: `Rule ${id}`, enabled: id % 2 === 0, spec: { template: 'exclude', params: { match: is('id', componentId) } } as RuleRecord['spec'], created_at: '' });
const ctxOf = (over: Partial<AssistantData> = {}): ToolContext => ({
  data: { library: [], categories: [], rules: [], ...over },
  compare: async () => { throw new Error('unused'); },
});

describe('tool registry', () => {
  it('declares the closed set of ten tools', () => {
    expect(TOOL_DECLARATIONS.map((t) => t.name)).toEqual([
      'search_dishes', 'get_rule', 'list_rules', 'get_plan', 'explain_rule', 'explain_plan_slot', 'propose_rule', 'propose_dish', 'propose_pairing', 'simulate_with_rule',
    ]);
  });

  it('rejects unknown tools', async () => {
    expect((await runTool('drop_tables', {}, ctxOf())).ok).toBe(false);
  });

  it('turns a throwing tool into ok:false', async () => {
    const ctx = ctxOf();
    Object.defineProperty(ctx.data, 'library', { get() { throw new Error('boom'); } });
    expect((await runTool('search_dishes', { query: 'paneer' }, ctx)).ok).toBe(false);
  });
});

describe('search_dishes', () => {
  it('returns ids, names and type only', async () => {
    const r = await runTool('search_dishes', { query: 'paneer' }, ctxOf({ library: [dish(1, 'Paneer Butter Masala'), dish(2, 'Dal')] }));
    expect(r).toEqual({ ok: true, data: { dishes: [{ id: 1, name: 'Paneer Butter Masala', type: 'curry' }] } });
    expect(JSON.stringify(r)).not.toContain('secret');
  });

  it('caps at 20 and reports the remainder', async () => {
    const library = Array.from({ length: 25 }, (_, i) => dish(i + 1, `Paneer ${i}`));
    const r = await runTool('search_dishes', { query: 'paneer' }, ctxOf({ library }));
    const data = (r as { ok: true; data: { dishes: unknown[]; more?: number } }).data;
    expect(data.dishes).toHaveLength(MAX_LIST_ITEMS);
    expect(data.more).toBe(5);
  });

  it('rejects bad args', async () => {
    expect((await runTool('search_dishes', {}, ctxOf())).ok).toBe(false);
    expect((await runTool('search_dishes', { query: 5 }, ctxOf())).ok).toBe(false);
  });
});

describe('get_rule', () => {
  it('describes a rule using library names', async () => {
    const r = await runTool('get_rule', { id: 10 }, ctxOf({ library: [dish(1, 'Pulao')], rules: [rule(10, 1)] }));
    expect(r.ok).toBe(true);
    const data = (r as { ok: true; data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ id: 10, name: 'Rule 10', enabled: true });
    expect(String(data.description)).toContain('Pulao');
  });

  it('fails for a missing rule', async () => {
    expect(await runTool('get_rule', { id: 999 }, ctxOf())).toEqual({ ok: false, error: 'no rule 999' });
  });
});

describe('list_rules', () => {
  it('lists id, name, description, enabled', async () => {
    const r = await runTool('list_rules', {}, ctxOf({ library: [dish(1, 'Pulao')], rules: [rule(10, 1)] }));
    expect(r).toMatchObject({ ok: true, data: { rules: [{ id: 10, name: 'Rule 10', enabled: true }] } });
    expect(JSON.stringify(r)).not.toContain('"spec"');
  });

  it('caps and counts the remainder, JSON-safe', async () => {
    const rules = Array.from({ length: 23 }, (_, i) => rule(i + 1, 1));
    const r = await runTool('list_rules', {}, ctxOf({ library: [dish(1, 'Pulao')], rules }));
    const data = (r as { ok: true; data: { rules: unknown[]; more?: number } }).data;
    expect(data.rules).toHaveLength(MAX_LIST_ITEMS);
    expect(data.more).toBe(3);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});

describe('declarations', () => {
  type Schema = { type?: string; properties?: Record<string, Schema>; items?: Schema };
  /** Every schema node, nested properties and array items included, with its path. */
  const nodes = (s: Schema | undefined, path: string): [string, Schema][] =>
    s ? [[path, s], ...Object.entries(s.properties ?? {}).flatMap(([k, v]) => nodes(v, `${path}.${k}`)), ...nodes(s.items, `${path}[]`)] : [];

  it('never send an object schema without properties, at any depth', () => {
    for (const t of TOOL_DECLARATIONS) {
      for (const [path, n] of nodes(t.parameters as Schema | undefined, t.name)) {
        if (n.type === 'object') expect(Object.keys(n.properties ?? {}).length, path).toBeGreaterThan(0);
      }
    }
  });

  it('declares spec as JSON text listing every template', () => {
    for (const name of ['propose_rule', 'simulate_with_rule']) {
      const spec = (TOOL_DECLARATIONS.find((t) => t.name === name)!.parameters as Schema & { properties: Record<string, { type: string; description: string }> }).properties.spec;
      expect(spec.type, name).toBe('string');
      expect(spec.description).toMatch(/JSON text of the rule spec/);
      for (const id of HAND_TEMPLATE_IDS) expect(spec.description).toContain(id);
      expect(spec.description).not.toContain('comes_with');
    }
  });
});

describe('explain_plan_slot', () => {
  const pulao = dish(1, 'Pulao', 'base' as never);
  const owned = dayRule(pulao, ['tuesday']);
  const planRule: RuleRecord = { id: 7, name: owned.name, spec: owned.spec, enabled: true, created_at: '' };
  const plan: WeeklyPlan = { slots: [
    { day: 'monday', meal_slot: 'lunch', base_id: 1, extra_ids: [] },
    { day: 'monday', meal_slot: 'dinner', base_id: 1, extra_ids: [] },
  ] };

  it('says so when there is no plan', async () => {
    expect(await runTool('explain_plan_slot', { day: 'monday', meal: 'lunch' }, ctxOf())).toEqual({ ok: true, data: { note: 'no plan' } });
  });

  it('rejects an invalid day or meal', async () => {
    const ctx = ctxOf({ plan });
    expect((await runTool('explain_plan_slot', { day: 'funday', meal: 'lunch' }, ctx)).ok).toBe(false);
    expect((await runTool('explain_plan_slot', { day: 'monday', meal: 'brunch' }, ctx)).ok).toBe(false);
  });

  it('returns that slot\'s problems under the current rules, with a note', async () => {
    const ctx = ctxOf({ library: [pulao], rules: [planRule], plan });
    const r = await runTool('explain_plan_slot', { day: 'monday', meal: 'lunch' }, ctx);
    expect(r.ok).toBe(true);
    const data = (r as { data: { problems: { ruleId?: number; meal?: string; day?: string }[]; note: string } }).data;
    expect(data.note).toMatch(/today.s rules/);
    expect(data.problems.some((p) => p.ruleId === 7 && p.day === 'monday' && p.meal === 'lunch')).toBe(true);
    expect(data.problems.every((p) => (p.day === undefined || p.day === 'monday') && (p.meal === undefined || p.meal === 'lunch'))).toBe(true);
  });

  it('reports deleted dishes instead of throwing', async () => {
    const ctx = ctxOf({ plan: { slots: [{ day: 'monday', meal_slot: 'lunch', base_id: 55, extra_ids: [] }] } });
    const r = await runTool('explain_plan_slot', { day: 'monday', meal: 'lunch' }, ctx);
    expect(r.ok).toBe(true);
    expect((r as { data: { missingDishIds: number[] } }).data.missingDishIds).toEqual([55]);
  });
});

describe('explain_rule', () => {
  const pulao = dish(1, 'Pulao', { componentType: 'base' });
  const tuesdayOnly = dayRule(pulao, ['tuesday']);
  const stored = (over: Partial<RuleRecord> = {}): RuleRecord => ({ id: 7, name: tuesdayOnly.name, spec: tuesdayOnly.spec, enabled: true, created_at: '', ...over });
  const plan: WeeklyPlan = { slots: [{ day: 'monday', meal_slot: 'lunch', base_id: 1, extra_ids: [] }] };
  const explain = async (over: Partial<AssistantData>, id = 7) => {
    const r = await runTool('explain_rule', { id }, ctxOf({ library: [pulao], ...over }));
    return (r as { ok: true; data: { status: string; rule: { id: number }; brokenAt?: { day?: string; meal?: string }[]; missing?: string[] } }).data;
  };

  it('says where the current plan breaks an active rule, in one call', async () => {
    const data = await explain({ rules: [stored()], plan });
    expect(data.status).toBe('active, and the current plan breaks it');
    expect(data.brokenAt?.[0]).toMatchObject({ day: 'monday', meal: 'lunch' });
  });

  it('says when the plan follows the rule', async () => {
    const data = await explain({ rules: [stored()], plan: { slots: [{ day: 'tuesday', meal_slot: 'lunch', base_id: 1, extra_ids: [] }] } });
    expect(data.status).toBe('active, and the current plan follows it');
    expect(data.brokenAt).toEqual([]);
  });

  it('says why a rule is ignored: switched off, or pointing at a deleted dish', async () => {
    expect((await explain({ rules: [stored({ enabled: false })], plan })).status).toMatch(/switched off/);
    const gone = dayRule({ id: 99, name: 'Gone' }, ['tuesday']);
    const data = await explain({ rules: [stored({ spec: gone.spec })], plan });
    expect(data.status).toMatch(/no longer exist/);
    expect(data.missing?.length).toBeGreaterThan(0);
  });

  it('copes with no plan and with an unknown rule', async () => {
    expect((await explain({ rules: [stored()] })).status).toMatch(/no plan/);
    expect((await runTool('explain_rule', { id: 404 }, ctxOf())).ok).toBe(false);
  });
});

describe('problemsForSlot', () => {
  const p = (over: Partial<PlanProblem>): PlanProblem => ({ level: 'hard', reason: 'r', message: 'm', ...over });
  const week = p({ message: 'week' });
  const exact = p({ message: 'exact', day: 'monday', meal: 'lunch' });
  const dayOnly = p({ message: 'day', day: 'monday' });
  const mealOnly = p({ message: 'meal', meal: 'lunch' });
  const otherSlot = p({ message: 'other slot', day: 'monday', meal: 'dinner' });
  const otherDay = p({ message: 'other day', day: 'tuesday' });
  const otherMeal = p({ message: 'other meal', meal: 'dinner' });
  const inSlots = p({ message: 'in slots', level: 'soft', slots: [{ day: 'monday', meal: 'lunch' }] });
  const elsewhere = p({ message: 'elsewhere', level: 'soft', slots: [{ day: 'monday', meal: 'dinner' }] });
  const all = [week, exact, dayOnly, mealOnly, otherSlot, otherDay, otherMeal, inSlots, elsewhere];
  const kept = problemsForSlot(all, 'monday', 'lunch').map((x) => x.message);

  it('keeps a problem that lists its meals only for those meals', () => {
    expect(kept).toContain('in slots');
    expect(kept).not.toContain('elsewhere');
  });

  it('keeps week-level problems (no day, no meal), which includes window groups', () => expect(kept).toContain('week'));
  it('keeps problems at exactly that day and meal', () => expect(kept).toContain('exact'));
  it('keeps day-level problems for that day', () => expect(kept).toContain('day'));
  it('keeps meal-level problems for that meal', () => expect(kept).toContain('meal'));
  it('drops problems located elsewhere', () => expect(kept).toEqual(['week', 'exact', 'day', 'meal', 'in slots']));
});

describe('explain_plan_slot: dishes and why not', () => {
  const pulao = dish(1, 'Pulao', { componentType: 'base' });
  const rice = dish(4, 'Jeera Rice', { componentType: 'base' });
  const dal = dish(2, 'Dal Tadka');
  const chole = dish(3, 'Chole');
  const raita = dish(5, 'Raita', { componentType: 'extra' });
  const library = [pulao, rice, dal, chole, raita];
  const plan: WeeklyPlan = { slots: [
    { day: 'monday', meal_slot: 'lunch', base_id: 1, curry_id: 2, extra_ids: [5] },
    { day: 'tuesday', meal_slot: 'dinner', base_id: 55, extra_ids: [] },
  ] };
  const noCholeMonday: RuleRecord = {
    id: 9, name: 'No chole on Monday', enabled: true, created_at: '',
    spec: { template: 'exclude', params: { match: is('id', 3), scope: { days: ['monday'] }, strength: 'must' } } as RuleRecord['spec'],
  };
  type Data = { dishes: unknown; whyNot?: { dish: { id: number; name: string }; part: string; blockedBy: { ruleId?: number }[]; note?: string } };
  const explain = async (args: object, over: Partial<AssistantData> = {}) =>
    runTool('explain_plan_slot', { day: 'monday', meal: 'lunch', ...args }, ctxOf({ library, plan, ...over }));

  it('returns the slot\'s dishes as id and name', async () => {
    const r = await explain({});
    expect((r as { data: Data }).data.dishes).toEqual({
      base: { id: 1, name: 'Pulao' }, curry: { id: 2, name: 'Dal Tadka' }, extras: [{ id: 5, name: 'Raita' }],
    });
  });

  it('marks a deleted dish in the slot instead of naming it', async () => {
    const r = await runTool('explain_plan_slot', { day: 'tuesday', meal: 'dinner' }, ctxOf({ library, plan }));
    expect((r as { data: Data }).data.dishes).toEqual({ base: { id: 55, deleted: true }, extras: [] });
  });

  it('says the slot is empty when the plan has nothing there', async () => {
    const r = await runTool('explain_plan_slot', { day: 'friday', meal: 'breakfast' }, ctxOf({ library, plan }));
    expect((r as { data: Data }).data.dishes).toBeNull();
  });

  it('declares an optional dish argument (name or id)', () => {
    const d = TOOL_DECLARATIONS.find((t) => t.name === 'explain_plan_slot')!;
    const params = d.parameters as { properties: Record<string, { type: string }>; required: string[] };
    expect(params.properties.dish.type).toBe('string');
    expect(params.required).not.toContain('dish');
  });

  it('reports the rule a named dish would break in that slot', async () => {
    const r = await explain({ dish: 'chole' }, { rules: [noCholeMonday] });
    expect(r.ok).toBe(true);
    const why = (r as { data: Data }).data.whyNot!;
    expect(why.dish).toEqual({ id: 3, name: 'Chole' });
    expect(why.part).toBe('curry');
    expect(why.blockedBy.some((p) => p.ruleId === 9)).toBe(true);
  });

  it('says no rule blocks a dish when none would be broken, pointing at variety and preferences', async () => {
    const r = await explain({ dish: 'Chole' });
    const why = (r as { data: Data }).data.whyNot!;
    expect(why.blockedBy).toEqual([]);
    expect(why.note).toMatch(/No rule blocks/);
    expect(why.note).toBe('No rule blocks Chole here; the planner chose other dishes this time.');
  });

  it('lists the dishes a pairing brought into the slot', async () => {
    const pongal = dish(10, 'Pongal', { componentType: 'base' });
    const sambar = dish(11, 'Sambar');
    const owned = linkRule(sambar, { mode: 'serve', target: 'base_dish', values: [10], strength: 'always' });
    const link = { id: 5, name: owned.name, spec: owned.spec, enabled: true, created_at: '', owner_component_id: 11 } as RuleRecord;
    const lib = [pongal, sambar, ...library];
    const r = await runTool('explain_plan_slot', { day: 'wednesday', meal: 'breakfast' }, ctxOf({
      library: lib, rules: [link],
      plan: { slots: [{ day: 'wednesday', meal_slot: 'breakfast', base_id: 10, curry_id: 11, extra_ids: [] }] },
    }));
    expect((r as { data: { pairedWith: unknown } }).data.pairedWith).toEqual([{ dish: 'Sambar', by: 'Pongal', how: 'Sambar is served with Pongal' }]);
    const w = await runTool('explain_plan_slot', { day: 'monday', meal: 'lunch', dish: 'Pongal' }, ctxOf({ library: lib, rules: [link], plan }));
    const why = (w as { data: Data }).data.whyNot!;
    expect(why.blockedBy).toEqual([]);
    expect(why.note).toBe('No rule blocks Pongal here; its paired dishes come with it.');
  });

  it('uses the neutral note for a base that brings nothing', async () => {
    const why = ((await explain({ dish: 'Jeera Rice' })) as { data: Data }).data.whyNot!;
    expect(why.note).toBe('No rule blocks Jeera Rice here; the planner chose other dishes this time.');
  });

  it('accepts a dish id as a number or numeric text', async () => {
    for (const dishArg of [3, '3']) {
      const why = ((await explain({ dish: dishArg }, { rules: [noCholeMonday] })) as { data: Data }).data.whyNot!;
      expect(why.dish.id).toBe(3);
    }
  });

  it('places an extra into the extras part', async () => {
    const why = ((await explain({ dish: 'raita' })) as { data: Data }).data.whyNot!;
    expect(why.part).toBe('extras');
  });

  it('says so when the dish is already in that slot', async () => {
    const why = ((await explain({ dish: 'Dal Tadka' })) as { data: Data }).data.whyNot!;
    expect(why.note).toMatch(/already/);
  });

  it('fails with a pointer to search_dishes for an unknown dish', async () => {
    const r = await explain({ dish: 'Biryani' });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/search_dishes/);
  });

  it('asks which dish when a name matches several, instead of guessing', async () => {
    const r = await explain({ dish: 'rice' }, { library: [...library, dish(6, 'Lemon Rice', { componentType: 'base' })] });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/Jeera Rice.*Lemon Rice|Lemon Rice.*Jeera Rice/);
  });

  it('works when another slot holds a deleted dish', async () => {
    const r = await explain({ dish: 'Jeera Rice' }, { rules: [noCholeMonday] });
    expect(r.ok).toBe(true);
    expect((r as { data: Data }).data.whyNot!.part).toBe('base');
  });
});

describe('get_plan', () => {
  it('says so when there is no plan', async () => {
    expect(await runTool('get_plan', {}, ctxOf())).toEqual({ ok: true, data: { note: 'no plan' } });
  });

  it('lists each day\'s meals as dish names, grouped by day, within the list cap', async () => {
    const library = [dish(1, 'Pulao', { componentType: 'base' }), dish(2, 'Dal')];
    const slots = ALL_DAYS.flatMap((day) => MEALS.map((meal) => ({ day, meal_slot: meal, base_id: 1, curry_id: 2, extra_ids: [] })));
    const r = await runTool('get_plan', undefined, ctxOf({ library, plan: { slots } }));
    const days = (r as { data: { days: { day: string; lunch?: string[] }[] } }).data.days;
    expect(days).toHaveLength(7);
    expect(days.length).toBeLessThanOrEqual(MAX_LIST_ITEMS);
    expect(days[0]).toEqual({ day: 'monday', breakfast: ['Pulao', 'Dal'], lunch: ['Pulao', 'Dal'], dinner: ['Pulao', 'Dal'] });
    expect(JSON.stringify(r)).not.toContain('secret');
  });

  it('marks deleted dishes and skips days without slots', async () => {
    const r = await runTool('get_plan', {}, ctxOf({ plan: { slots: [{ day: 'wednesday', meal_slot: 'dinner', base_id: 55, extra_ids: [] }] } }));
    expect((r as { data: unknown }).data).toEqual({ days: [{ day: 'wednesday', dinner: ['#55 (deleted)'] }] });
  });
});

describe('explain_plan_slot declaration and results', () => {
  const decl = TOOL_DECLARATIONS.find((t) => t.name === 'explain_plan_slot')!;
  const props = (decl.parameters as { properties: Record<string, { description: string }> }).properties;

  it('describes day and meal values in lowercase and has no dishId', () => {
    expect(props.day.description).toMatch(/monday.*sunday/);
    expect(props.day.description).not.toMatch(/Monday/);
    expect(props.meal.description).toMatch(/breakfast\|lunch\|dinner/);
    expect('dishId' in props).toBe(false);
  });

  it('accepts capitalised day and meal', async () => {
    const plan: WeeklyPlan = { slots: [{ day: 'monday', meal_slot: 'lunch', base_id: 1, extra_ids: [] }] };
    const r = await runTool('explain_plan_slot', { day: 'Monday', meal: 'Lunch' }, ctxOf({ library: [dish(1, 'Pulao')], plan }));
    expect(r.ok).toBe(true);
    expect((r as { data: { day: string } }).data.day).toBe('monday');
  });

  it('notes that problems may stem from a deleted dish when dishes are missing', async () => {
    const ctx = ctxOf({ plan: { slots: [{ day: 'monday', meal_slot: 'lunch', base_id: 55, extra_ids: [] }] } });
    const d = (await runTool('explain_plan_slot', { day: 'monday', meal: 'lunch' }, ctx) as { data: { deletedDishNote?: string } }).data;
    expect(d.deletedDishNote).toMatch(/deleted dish/);
    const ok = ctxOf({ library: [dish(1, 'Pulao')], plan: { slots: [{ day: 'monday', meal_slot: 'lunch', base_id: 1, extra_ids: [] }] } });
    expect(((await runTool('explain_plan_slot', { day: 'monday', meal: 'lunch' }, ok)) as { data: object }).data).not.toHaveProperty('deletedDishNote');
  });
});

describe('simulate_with_rule', () => {
  const spec = { template: 'exclude', params: { match: is('id', 2) } };
  const slot = (i: number) => ({ day: 'monday' as const, meal: 'lunch' as const, before: `A${i}`, after: `B${i}`, touchedByRule: i % 2 === 0 });
  const comparison = (n: number) => {
    const plan: WeeklyPlan = { slots: [] };
    return { before: plan, after: plan, changes: Array.from({ length: n }, (_, i) => slot(i)), identical: n === 0, worse: false, newHardProblems: [] };
  };
  const withCompare = (n: number, calls: unknown[] = []): ToolContext => ({
    ...ctxOf(),
    compare: async (s, name) => { calls.push([s, name]); return comparison(n); },
  });

  it('declares name and spec', () => {
    const d = TOOL_DECLARATIONS.find((t) => t.name === 'simulate_with_rule')!;
    expect(Object.keys((d.parameters as { properties: object }).properties)).toEqual(['name', 'spec']);
  });

  it('returns a compact diff and a comparison effect', async () => {
    const calls: unknown[] = [];
    const r = await runTool('simulate_with_rule', { name: 'No paneer', spec }, withCompare(2, calls));
    expect(r.ok).toBe(true);
    const ok = r as { data: { identical: boolean; worse: boolean; changes: unknown[] }; effect?: { kind: string } };
    expect(ok.data).toMatchObject({ identical: false, worse: false });
    expect(ok.data.changes).toEqual([
      { day: 'monday', meal: 'lunch', before: 'A0', after: 'B0', touchedByRule: true },
      { day: 'monday', meal: 'lunch', before: 'A1', after: 'B1', touchedByRule: false },
    ]);
    expect(ok.effect?.kind).toBe('comparison');
    expect(calls).toHaveLength(1);
    expect((calls[0] as unknown[])[1]).toBe('No paneer');
  });

  it('caps the diff at 21 changes with a count of the rest', async () => {
    const r = (await runTool('simulate_with_rule', { name: 'x', spec }, withCompare(25))) as { data: { changes: unknown[]; more?: number } };
    expect(r.data.changes).toHaveLength(21);
    expect(r.data.more).toBe(4);
  });

  it('rejects an invalid spec without comparing', async () => {
    const calls: unknown[] = [];
    const r = await runTool('simulate_with_rule', { name: 'x', spec: { template: 'nope', params: {} } }, withCompare(1, calls));
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('accepts the spec as JSON text', async () => {
    const calls: unknown[] = [];
    const r = await runTool('simulate_with_rule', { name: 'x', spec: JSON.stringify(spec) }, withCompare(1, calls));
    expect(r.ok).toBe(true);
    expect((calls[0] as unknown[])[0]).toMatchObject({ template: 'exclude' });
  });

  it('rejects spec text that is not valid JSON without comparing, asking for valid JSON', async () => {
    const calls: unknown[] = [];
    const r = await runTool('simulate_with_rule', { name: 'x', spec: '{template: exclude' }, withCompare(1, calls));
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/valid JSON/);
    expect(calls).toHaveLength(0);
  });

  it('refuses a comes_with spec, which only a dish form or propose_pairing makes, without comparing', async () => {
    const calls: unknown[] = [];
    const comes = linkRule({ id: 1, name: 'Idiyappam' }, { mode: 'comes', target: 'curry_dish', values: [2] }).spec;
    const r = await runTool('simulate_with_rule', { name: 'x', spec: comes }, withCompare(1, calls));
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/comes_with/);
    expect(calls).toHaveLength(0);
  });

  it('turns a failing comparison into ok:false', async () => {
    const r = await runTool('simulate_with_rule', { name: 'x', spec }, ctxOf());
    expect(r).toEqual({ ok: false, error: 'unused' });
  });
});

describe('propose_rule', () => {
  const library = [dish(1, 'Sambar')];
  const good = { template: 'exclude', params: { match: is('id', 1), strength: 'must' } };

  it('returns a rule-draft effect for a valid spec', async () => {
    const r = await runTool('propose_rule', { name: ' No sambar ', spec: good }, ctxOf({ library }));
    expect(r.ok).toBe(true);
    const effect = (r as { effect?: { kind: string; draft: { name: string; spec: unknown } } }).effect;
    expect(effect?.kind).toBe('rule-draft');
    expect(effect?.draft.name).toBe('No sambar');
    expect((effect?.draft.spec as { template: string }).template).toBe('exclude');
  });

  it('rejects an unknown template without an effect', async () => {
    const r = await runTool('propose_rule', { name: 'x', spec: { template: 'nonsense', params: {} } }, ctxOf({ library }));
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty('effect');
  });

  it('refuses a comes_with spec and points at propose_pairing', async () => {
    const lib = [dish(1, 'Idiyappam', { componentType: 'base' }), dish(2, 'Kerala Stew')];
    const comes = linkRule({ id: 1, name: 'Idiyappam' }, { mode: 'comes', target: 'curry_dish', values: [2] }).spec;
    const r = await runTool('propose_rule', { name: 'x', spec: comes }, ctxOf({ library: lib }));
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/propose_pairing/);
    expect(r).not.toHaveProperty('effect');
  });

  it('rejects a spec referencing a missing component', async () => {
    const r = await runTool('propose_rule', { name: 'x', spec: { template: 'exclude', params: { match: is('id', 999), strength: 'must' } } }, ctxOf({ library }));
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain('component #999');
    expect(r).not.toHaveProperty('effect');
  });

  it('accepts the spec as JSON text', async () => {
    const r = await runTool('propose_rule', { name: 'No sambar', spec: JSON.stringify(good) }, ctxOf({ library }));
    expect(r.ok).toBe(true);
    expect((r as { effect?: { kind: string } }).effect?.kind).toBe('rule-draft');
  });

  it('rejects spec text that is not valid JSON, asking for valid JSON', async () => {
    const r = await runTool('propose_rule', { name: 'x', spec: 'not json' }, ctxOf({ library }));
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/valid JSON/);
    expect(r).not.toHaveProperty('effect');
  });

  it('rejects a blank name', async () => {
    expect((await runTool('propose_rule', { name: '  ', spec: good }, ctxOf({ library }))).ok).toBe(false);
  });
});

describe('propose_dish', () => {
  const categories = [
    { id: 1, kind: 'base' as const, name: 'rice-based', created_at: '' },
    { id: 2, kind: 'extra' as const, name: 'crunchy', created_at: '' },
  ];
  const library = [dish(1, 'Sambar'), dish(2, 'Sambar', { componentType: 'base' })];
  const ctx = () => ctxOf({ library, categories });
  const effectOf = (r: unknown) => (r as { effect?: { kind: string; draft: Record<string, unknown> } }).effect;

  it('drafts a curry with its category and tags', async () => {
    const r = await runTool('propose_dish', { name: ' Palak Paneer ', componentType: 'curry', curry_category: 'paneer', dietary_tags: ['veg'], protein_tag: 'paneer' }, ctx());
    expect(r.ok).toBe(true);
    expect(effectOf(r)).toEqual({
      kind: 'dish-draft',
      draft: { name: 'Palak Paneer', componentType: 'curry', curry_category: 'paneer', dietary_tags: ['veg'], protein_tag: 'paneer' },
    });
  });

  it('drafts a dish with the bases it is served with, resolved by name', async () => {
    const lib = [...library, dish(3, 'Idli', { componentType: 'base' })];
    const r = await runTool('propose_dish', { name: 'Coconut Chutney', componentType: 'extra', served_with_bases: ['idli'], served_with_base_categories: ['Rice-Based'], served_with_strength: 'Often' }, ctxOf({ library: lib, categories }));
    expect(r.ok).toBe(true);
    expect((r as { effect: { links: unknown } }).effect.links).toEqual([
      { mode: 'serve', target: 'base_dish', values: [3], strength: 'moderately' },
      { mode: 'serve', target: 'base_category', values: [1], strength: 'moderately' },
    ]);
    expect((r as { data: { servedWith: string[] } }).data.servedWith).toEqual(['idli', 'Rice-Based']);
  });

  it('refuses unknown bases, and serving a base with bases', async () => {
    const unknown = await runTool('propose_dish', { name: 'Chutney', componentType: 'extra', served_with_bases: ['Pesarattu'] }, ctx());
    expect(unknown.ok).toBe(false);
    expect((unknown as { error: string }).error).toContain('no base named "Pesarattu"');
    const base = await runTool('propose_dish', { name: 'Upma', componentType: 'base', served_with_bases: ['Sambar'] }, ctx());
    expect(base.ok).toBe(false);
  });

  it('resolves a base category name to its id', async () => {
    const r = await runTool('propose_dish', { name: 'Jeera Rice', componentType: 'base', base_category: 'Rice-Based' }, ctx());
    expect(effectOf(r)?.draft).toMatchObject({ componentType: 'base', base_category_id: 1 });
  });

  it('resolves an extra category name to its id', async () => {
    const r = await runTool('propose_dish', { name: 'Papad', componentType: 'extra', extra_category: 'crunchy' }, ctx());
    expect(effectOf(r)?.draft).toMatchObject({ componentType: 'extra', extra_category_id: 2 });
  });

  it('lists existing categories for an unknown name and creates none', async () => {
    const r = await runTool('propose_dish', { name: 'Jeera Rice', componentType: 'base', base_category: 'grainy' }, ctx());
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain('rice-based');
    expect(r).not.toHaveProperty('effect');
  });

  it('rejects a category that does not fit the type', async () => {
    expect((await runTool('propose_dish', { name: 'X', componentType: 'curry', base_category: 'rice-based' }, ctx())).ok).toBe(false);
  });

  it('rejects an unknown tag and lists valid values', async () => {
    const r = await runTool('propose_dish', { name: 'X', componentType: 'curry', dietary_tags: ['tasty'] }, ctx());
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain('non-veg');
  });

  it('rejects an unknown type', async () => {
    expect((await runTool('propose_dish', { name: 'X', componentType: 'dessert' }, ctx())).ok).toBe(false);
  });

  it('rejects a duplicate of the same type, ignoring case and spacing', async () => {
    const r = await runTool('propose_dish', { name: '  SAMBAR ', componentType: 'curry' }, ctx());
    expect(r).toEqual({ ok: false, error: expect.stringContaining('already in the library: Sambar') });
  });

  it('allows the same name under another type', async () => {
    expect((await runTool('propose_dish', { name: 'Sambar', componentType: 'subzi' }, ctx())).ok).toBe(true);
  });

  it('flags near-duplicates but still drafts', async () => {
    const r = await runTool('propose_dish', { name: 'Sambhar rice', componentType: 'base' }, ctxOf({ library: [dish(1, 'Sambar'), dish(2, 'Dal')], categories }));
    expect(r.ok).toBe(true);
    expect((r as { data: { similarExisting: string[] } }).data.similarExisting).toEqual(['Sambar']);
    expect(effectOf(r)?.kind).toBe('dish-draft');
  });

  it('flags a name that contains an existing one and caps the list at five', async () => {
    const many = Array.from({ length: 8 }, (_, i) => dish(i + 1, `Paneer ${i}`));
    const r = await runTool('propose_dish', { name: 'Paneer', componentType: 'subzi' }, ctxOf({ library: many, categories }));
    expect((r as { data: { similarExisting: string[] } }).data.similarExisting).toHaveLength(5);
  });

  it('has no similar dishes when nothing resembles it', async () => {
    const r = await runTool('propose_dish', { name: 'Khichdi', componentType: 'base' }, ctx());
    expect((r as { data: { similarExisting: string[] } }).data.similarExisting).toEqual([]);
  });
});

describe('propose_pairing', () => {
  const categories = [{ id: 1, kind: 'base' as const, name: 'rice-based', created_at: '' }];
  const library = [dish(1, 'Sambar'), dish(2, 'Sambar', { componentType: 'base' }), dish(3, 'Idli', { componentType: 'base' }), dish(4, 'Dosa', { componentType: 'base' })];
  const ctx = (over: Partial<AssistantData> = {}) => ctxOf({ library, categories, ...over });

  it('pairs an existing dish with bases and base categories, resolved by name or id', async () => {
    const r = await runTool('propose_pairing', { dish: 'sambar', served_with_bases: ['IDLI', '4'], served_with_base_categories: ['Rice-Based'], served_with_strength: 'usually' }, ctx());
    expect(r.ok).toBe(true);
    expect((r as { effect: unknown }).effect).toEqual({
      kind: 'dish-links',
      dishId: 1,
      dishName: 'Sambar',
      links: [
        { mode: 'serve', target: 'base_dish', values: [3, 4], strength: 'usually' },
        { mode: 'serve', target: 'base_category', values: [1], strength: 'usually' },
      ],
    });
    const byId = await runTool('propose_pairing', { dish: 1, served_with_bases: ['Idli'] }, ctx());
    expect((byId as { effect: { links: unknown } }).effect.links).toEqual([{ mode: 'serve', target: 'base_dish', values: [3], strength: 'always' }]);
  });

  it('keeps the bases the dish is already served with', async () => {
    const stored = { id: 9, enabled: true, created_at: '', ...linkRule({ id: 1, name: 'Sambar' }, { mode: 'serve', target: 'base_dish', values: [4], strength: 'sometimes', scope: { meals: ['breakfast'] } }) };
    const r = await runTool('propose_pairing', { dish: 'Sambar', served_with_bases: ['Idli'] }, ctx({ rules: [stored] }));
    expect((r as { effect: { links: unknown } }).effect.links).toEqual([
      { mode: 'serve', target: 'base_dish', values: [4, 3], strength: 'sometimes', scope: { meals: ['breakfast'] } },
    ]);
    expect((r as { data: { alreadyServedWith: string[] } }).data.alreadyServedWith).toEqual(['Dosa']);
  });

  it('replaces a switched-off link instead of keeping its bases', async () => {
    const stored = { id: 9, enabled: false, created_at: '', ...linkRule({ id: 1, name: 'Sambar' }, { mode: 'serve', target: 'base_dish', values: [4], strength: 'sometimes', scope: { meals: ['breakfast'] } }) };
    const r = await runTool('propose_pairing', { dish: 'Sambar', served_with_bases: ['Idli'] }, ctx({ rules: [stored] }));
    expect((r as { effect: { links: unknown } }).effect.links).toEqual([{ mode: 'serve', target: 'base_dish', values: [3], strength: 'always' }]);
    const data = (r as { data: Record<string, unknown> }).data;
    expect(data.alreadyServedWith).toBeUndefined();
    expect(data.replacesSwitchedOffLink).toBe(true);
  });

  it('refuses a second curry always served with the same base, but accepts a softer one', async () => {
    const lib = [dish(1, 'Sambar'), dish(5, 'Rasam'), dish(3, 'Idli', { componentType: 'base' })];
    const sambarIdli = { id: 9, enabled: true, created_at: '', ...linkRule({ id: 1, name: 'Sambar' }, { mode: 'serve', target: 'base_dish', values: [3], strength: 'always' }) };
    const message = 'Sambar is already always served with Idli, and a meal holds one curry.';
    const c = () => ctxOf({ library: lib, categories, rules: [sambarIdli] });
    expect(await runTool('propose_pairing', { dish: 'Rasam', served_with_bases: ['Idli'] }, c())).toEqual({ ok: false, error: message });
    expect(await runTool('propose_pairing', { dish: 'Rasam', served_with_bases: ['Idli'], served_with_strength: 'always' }, c())).toEqual({ ok: false, error: message });
    expect((await runTool('propose_pairing', { dish: 'Rasam', served_with_bases: ['Idli'], served_with_strength: 'usually' }, c())).ok).toBe(true);
    expect(await runTool('propose_dish', { name: 'Kootu', componentType: 'curry', served_with_bases: ['Idli'] }, c())).toMatchObject({ ok: false, error: expect.stringContaining('is already always served with Idli') });
    expect((await runTool('propose_dish', { name: 'Kootu', componentType: 'curry', served_with_bases: ['Idli'], served_with_strength: 'usually' }, c())).ok).toBe(true);
  });

  it('propose_pairing refuses a pairing clashing with a comes-with link', async () => {
    const lib = [dish(1, 'Sambar'), dish(5, 'Rasam'), dish(3, 'Idli', { componentType: 'base' })];
    const comes = { id: 9, enabled: true, created_at: '', ...linkRule({ id: 3, name: 'Idli' }, { mode: 'comes', target: 'curry_dish', values: [1], strength: 'always' }) };
    const c = () => ctxOf({ library: lib, categories, rules: [comes] });
    expect(await runTool('propose_pairing', { dish: 'Rasam', served_with_bases: ['Idli'] }, c())).toMatchObject({ ok: false, error: expect.stringContaining('Idli always comes with Sambar') });
    expect((await runTool('propose_pairing', { dish: 'Sambar', served_with_bases: ['Idli'] }, c())).ok).toBe(true);
  });

  it('checks every base a firmer strength applies to, not only the bases asked for', async () => {
    const lib = [dish(1, 'Sambar'), dish(5, 'Rasam'), dish(3, 'Idli', { componentType: 'base' }), dish(4, 'Pongal', { componentType: 'base' })];
    const link = (id: number, owner: number, name: string, values: number[], strength: 'always' | 'usually') =>
      ({ id, enabled: true, created_at: '', ...linkRule({ id: owner, name }, { mode: 'serve', target: 'base_dish', values, strength }) });
    const c = () => ctxOf({ library: lib, categories, rules: [link(9, 1, 'Sambar', [3], 'always'), link(10, 5, 'Rasam', [3, 4], 'usually')] });
    // Rasam always with Pongal would also make Rasam always served with Idli, beside Sambar.
    const r = await runTool('propose_pairing', { dish: 'Rasam', served_with_bases: ['Pongal'], served_with_strength: 'always' }, c());
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('Idli') });
    // Asking for nothing firmer keeps the stored strength, which is fine.
    expect((await runTool('propose_pairing', { dish: 'Rasam', served_with_bases: ['Pongal'] }, c())).ok).toBe(true);
  });

  it('does not refuse a conflict that is already stored, only what the proposal adds', async () => {
    const lib = [dish(1, 'Sambar'), dish(5, 'Rasam'), dish(3, 'Idli', { componentType: 'base' }), dish(4, 'Dosa', { componentType: 'base' })];
    const rule = (id: number, owner: number, name: string, values: number[]) =>
      ({ id, enabled: true, created_at: '', ...linkRule({ id: owner, name }, { mode: 'serve', target: 'base_dish', values, strength: 'always' }) });
    const rules = [rule(9, 1, 'Sambar', [3]), rule(10, 5, 'Rasam', [3])];
    const c = () => ctxOf({ library: lib, categories, rules });
    expect((await runTool('propose_pairing', { dish: 'Rasam', served_with_bases: ['Idli'] }, c())).ok).toBe(true);
    expect((await runTool('propose_pairing', { dish: 'Rasam', served_with_bases: ['Dosa'] }, c())).ok).toBe(true);
    const sambarDosa = ctxOf({ library: lib, categories, rules: [...rules, rule(11, 1, 'Sambar', [4])] });
    expect((await runTool('propose_pairing', { dish: 'Rasam', served_with_bases: ['Dosa'] }, sambarDosa)).ok).toBe(false);
  });

  it('takes an exact base name as that base, not a side that contains it', async () => {
    const r = await runTool('propose_pairing', { dish: 'idli', served_with_bases: ['Dosa'] }, ctx({ library: [...library, dish(5, 'Idli podi', { componentType: 'extra' })] }));
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain('a base cannot be served with bases');
  });

  it('rejects bases, unknown names and a pairing with nothing to pair', async () => {
    const base = await runTool('propose_pairing', { dish: 'Idli', served_with_bases: ['Dosa'] }, ctx());
    expect(base.ok).toBe(false);
    expect((base as { error: string }).error).toContain('a base cannot be served with bases');
    const unknownDish = await runTool('propose_pairing', { dish: 'Pesarattu', served_with_bases: ['Idli'] }, ctx());
    expect((unknownDish as { error: string }).error).toContain('no dish named "Pesarattu"');
    const unknownBase = await runTool('propose_pairing', { dish: 'Sambar', served_with_bases: ['Pesarattu'] }, ctx());
    expect((unknownBase as { error: string }).error).toContain('no base named "Pesarattu"');
    const unknownCategory = await runTool('propose_pairing', { dish: 'Sambar', served_with_base_categories: ['grainy'] }, ctx());
    expect((unknownCategory as { error: string }).error).toContain('no base category named "grainy"');
    expect((await runTool('propose_pairing', { dish: 'Sambar' }, ctx())).ok).toBe(false);
  });
});

describe('comes-with drafts', () => {
  const categories = [{ id: 2, kind: 'extra' as const, name: 'crunchy', created_at: '' }];
  const library = [
    dish(1, 'Idli', { componentType: 'base' }),
    dish(2, 'Sambar'),
    dish(3, 'Rasam', { componentType: 'extra' }),
    dish(4, 'Mutton Curry'),
    dish(5, 'Beans Poriyal', { componentType: 'subzi' }),
    dish(6, 'Cabbage Thoran', { componentType: 'subzi' }),
  ];
  const ctx = (over: Partial<AssistantData> = {}) => ctxOf({ library, categories, ...over });
  const effectOf = (r: unknown) => (r as { effect?: unknown }).effect;

  it('propose_pairing drafts two comes-with links on one dish', async () => {
    const r = await runTool('propose_pairing', {
      dish: 'Idli',
      comes_with: [{ dishes: ['Sambar'], strength: 'usually' }, { extra_categories: ['crunchy'] }],
    }, ctx());
    expect(r.ok).toBe(true);
    expect(effectOf(r)).toEqual({
      kind: 'dish-links', dishId: 1, dishName: 'Idli',
      links: [
        { mode: 'comes', target: 'curry_dish', values: [2], strength: 'usually' },
        { mode: 'comes', target: 'extra_category', values: [2], strength: 'always' },
      ],
    });
  });

  it('propose_dish drafts Mutton Curry coming with Rasam', async () => {
    const r = await runTool('propose_dish', { name: 'Mutton Kuzhambu', componentType: 'curry', comes_with: [{ dishes: ['Rasam'] }] }, ctx());
    expect(r.ok).toBe(true);
    expect((effectOf(r) as { links: unknown }).links).toEqual([{ mode: 'comes', target: 'extra_dish', values: [3], strength: 'always' }]);
    const named = await runTool('propose_dish', { name: 'Mutton Curry 2', componentType: 'curry', comes_with: [{ dishes: ['Rasam'] }] }, ctx());
    expect(named.ok).toBe(true);
  });

  it('draws the dish type of each entry from the dishes named, and curry types from their own list', async () => {
    const r = await runTool('propose_pairing', { dish: 'Idli', comes_with: [{ dishes: ['Beans Poriyal'] }, { curry_types: ['soup'] }] }, ctx());
    expect((effectOf(r) as { links: unknown }).links).toEqual([
      { mode: 'comes', target: 'subzi_dish', values: [5], strength: 'always' },
      { mode: 'comes', target: 'curry_category', values: ['soup'], strength: 'always' },
    ]);
  });

  it('returns an error for names and targets the dish may not use', async () => {
    const msg = async (name: string, args: object) => {
      const r = await runTool('propose_pairing', { dish: name, ...args }, ctx());
      expect(r.ok).toBe(false);
      return (r as { error: string }).error;
    };
    expect(await msg('Idli', { comes_with: [{ dishes: ['Pesarattu'] }] })).toMatch(/Pesarattu/);
    expect(await msg('Idli', { comes_with: [{ extra_categories: ['grainy'] }] })).toMatch(/grainy/);
    expect(await msg('Idli', { comes_with: [{ curry_types: ['gravy-ish'] }] })).toMatch(/gravy-ish/);
    // a curry never comes with curries, a subzi never with subzis, and a base is not a side
    expect(await msg('Mutton Curry', { comes_with: [{ dishes: ['Sambar'] }] })).toMatch(/curr/);
    expect(await msg('Beans Poriyal', { comes_with: [{ dishes: ['Cabbage Thoran'] }] })).toMatch(/subzi/);
    expect(await msg('Sambar', { comes_with: [{ dishes: ['Idli'] }] })).toMatch(/base/);
    expect(await msg('Idli', { comes_with: [{}] })).toMatch(/comes_with/);
    expect(await msg('Idli', { comes_with: [{ dishes: ['Sambar'], curry_types: ['soup'] }] })).toMatch(/one kind/);
    expect(await msg('Idli', { comes_with: [{ dishes: ['Sambar', 'Rasam'] }] })).toMatch(/same type|one type/);
  });

  it('refuses a comes-with draft that cannot hold with what is stored', async () => {
    const serve = { id: 9, enabled: true, created_at: '', ...linkRule({ id: 4, name: 'Mutton Curry' }, { mode: 'serve', target: 'base_dish', values: [1] }) } as RuleRecord;
    const r = await runTool('propose_pairing', { dish: 'Idli', comes_with: [{ dishes: ['Sambar'] }] }, ctx({ rules: [serve] }));
    // Idli would bring Sambar and Mutton Curry, two curries in one meal
    expect(r.ok).toBe(false);
    expect((await runTool('propose_pairing', { dish: 'Idli', comes_with: [{ dishes: ['Sambar'] }] }, ctx())).ok).toBe(true);
  });

  it('explain_plan_slot says Idiyappam comes with Kerala Stew (Veg)', async () => {
    const lib = [dish(10, 'Idiyappam', { componentType: 'base' }), dish(11, 'Kerala Stew (Veg)')];
    const owned = linkRule({ id: 10, name: 'Idiyappam' }, { mode: 'comes', target: 'curry_dish', values: [11], strength: 'always' });
    const link = { id: 5, name: owned.name, spec: owned.spec, enabled: true, created_at: '', owner_component_id: 10 } as RuleRecord;
    const r = await runTool('explain_plan_slot', { day: 'monday', meal: 'lunch' }, ctxOf({
      library: lib, rules: [link],
      plan: { slots: [{ day: 'monday', meal_slot: 'lunch', base_id: 10, curry_id: 11, extra_ids: [] }] },
    }));
    expect((r as { data: { pairedWith: unknown } }).data.pairedWith).toEqual([
      { dish: 'Kerala Stew (Veg)', by: 'Idiyappam', how: 'Idiyappam comes with Kerala Stew (Veg)' },
    ]);
  });

  it('keeps the comes_with template out of the rule templates', () => {
    expect(HAND_TEMPLATE_IDS).not.toContain('comes_with');
  });

  it('declares comes_with on both draft tools', () => {
    for (const name of ['propose_dish', 'propose_pairing']) {
      const d = TOOL_DECLARATIONS.find((t) => t.name === name)!;
      expect(JSON.stringify(d.parameters)).toContain('comes_with');
    }
  });

  it('says in each meal which link brought a side that has both a comes link and a serve link', async () => {
    const lib = [dish(10, 'Rice', { componentType: 'base' }), dish(11, 'Mutton Curry'), dish(12, 'Rasam', { componentType: 'extra' }), dish(13, 'Appam', { componentType: 'base' })];
    const comes = linkRule({ id: 11, name: 'Mutton Curry' }, { mode: 'comes', target: 'extra_dish', values: [12], strength: 'always' });
    const serve = linkRule({ id: 12, name: 'Rasam' }, { mode: 'serve', target: 'base_dish', values: [10], strength: 'always' });
    const rules = [
      { id: 5, name: comes.name, spec: comes.spec, enabled: true, created_at: '', owner_component_id: 11 },
      { id: 6, name: serve.name, spec: serve.spec, enabled: true, created_at: '', owner_component_id: 12 },
    ] as RuleRecord[];
    const plan: WeeklyPlan = { slots: [
      { day: 'monday', meal_slot: 'lunch', base_id: 13, curry_id: 11, extra_ids: [12] },
      { day: 'tuesday', meal_slot: 'lunch', base_id: 10, extra_ids: [12] },
    ] };
    const how = async (day: string) => ((await runTool('explain_plan_slot', { day, meal: 'lunch' }, ctxOf({ library: lib, rules, plan }))) as { data: { pairedWith: { how: string }[] } }).data.pairedWith.map((p) => p.how);
    expect(await how('monday')).toEqual(['Mutton Curry comes with Rasam']);
    expect(await how('tuesday')).toEqual(['Rasam is served with Rice']);
  });

  it('propose_pairing appends a comes link beside a stored one instead of merging into it', async () => {
    const lib = [dish(1, 'Idli', { componentType: 'base' }), dish(2, 'Sambar'), dish(3, 'Rasam', { componentType: 'extra' })];
    const stored = { id: 9, enabled: true, created_at: '', ...linkRule({ id: 1, name: 'Idli' }, { mode: 'comes', target: 'curry_dish', values: [2], strength: 'always' }) } as RuleRecord;
    const r = await runTool('propose_pairing', { dish: 'Idli', comes_with: [{ dishes: ['Rasam'] }] }, ctxOf({ library: lib, categories, rules: [stored] }));
    expect(effectOf(r)).toEqual({
      kind: 'dish-links', dishId: 1, dishName: 'Idli',
      links: [{ mode: 'comes', target: 'extra_dish', values: [3], strength: 'always' }],
    });
  });
});
