import { describe, expect, it } from 'vitest';
import { is } from '@/planner';
import type { RuleRecord } from '@/rules';
import type { ComponentRecord } from '@/types/component';
import { MAX_LIST_ITEMS } from './limits';
import type { AssistantData } from './retrieve';
import { TOOL_DECLARATIONS, runTool } from './tools';
import { dayRule } from '@/rules';
import type { WeeklyPlan } from '@/types/plan';
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
  it('declares the closed set of seven tools', () => {
    expect(TOOL_DECLARATIONS.map((t) => t.name)).toEqual([
      'search_dishes', 'get_rule', 'list_rules', 'explain_plan_slot', 'propose_rule', 'propose_dish', 'simulate_with_rule',
    ]);
  });

  it('rejects unknown tools', async () => {
    expect((await runTool('drop_tables', {}, ctxOf())).ok).toBe(false);
  });

  it('reports later-task tools as not available', async () => {
    expect(await runTool('propose_rule', {}, ctxOf())).toEqual({ ok: false, error: 'not available' });
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
  it('never send an object parameter schema with empty properties', () => {
    for (const t of TOOL_DECLARATIONS) {
      const p = t.parameters as { type?: string; properties?: object } | undefined;
      if (p?.type === 'object') expect(Object.keys(p.properties ?? {}).length, t.name).toBeGreaterThan(0);
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
    expect(data.problems.every((p) => (p.day === undefined && p.meal === undefined) || (p.day === 'monday' && p.meal === 'lunch'))).toBe(true);
  });

  it('reports deleted dishes instead of throwing', async () => {
    const ctx = ctxOf({ plan: { slots: [{ day: 'monday', meal_slot: 'lunch', base_id: 55, extra_ids: [] }] } });
    const r = await runTool('explain_plan_slot', { day: 'monday', meal: 'lunch' }, ctx);
    expect(r.ok).toBe(true);
    expect((r as { data: { missingDishIds: number[] } }).data.missingDishIds).toEqual([55]);
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

  it('turns a failing comparison into ok:false', async () => {
    const r = await runTool('simulate_with_rule', { name: 'x', spec }, ctxOf());
    expect(r).toEqual({ ok: false, error: 'unused' });
  });
});
