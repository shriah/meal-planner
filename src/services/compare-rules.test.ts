import { describe, expect, it } from 'vitest';
import { is } from '@/planner';
import { linkRule, ownedChanges, type DishLink, type LinkChange, type RuleRecord } from '@/rules';
import type { ComponentRecord } from '@/types/component';
import { planFromData, type PlanningInput, type PlanningOptions } from './plan-generation';
import { compareRuleSets, pendingRules } from './compare-rules';

const dish = (id: number, name: string, componentType: string): ComponentRecord =>
  ({ id, name, componentType, dietary_tags: ['veg'], regional_tags: [], occasion_tags: [], created_at: '' } as ComponentRecord);
const library = [dish(1, 'Pulao', 'base'), dish(2, 'Paneer', 'curry'), dish(3, 'Dal', 'curry'), dish(4, 'Rajma', 'curry')];
const run = async (input: PlanningInput, opts: PlanningOptions) => planFromData(input, opts);

const NONE = { days: [], meals: [], neverAuto: false };
const rule = (id: number, owner: number | undefined, spec: RuleRecord['spec'], enabled = true): RuleRecord =>
  ({ id, name: `r${id}`, spec, enabled, created_at: 'then', ...(owner === undefined ? {} : { owner_component_id: owner }) } as RuleRecord);

describe('compareRuleSets', () => {
  it('reports identical when the rules are the same', async () => {
    const input = { library, categories: [], rules: [] };
    const c = await compareRuleSets(input, [], { seed: 1 }, run);
    expect(c.identical).toBe(true);
    expect(c.changes).toEqual([]);
    expect(c.worse).toBe(false);
  });

  it('marks changed slots holding the edited dish as touched', async () => {
    const input = { library, categories: [], rules: [] };
    const after = [rule(-1, 2, { template: 'exclude', params: { match: is('id', 2) } } as RuleRecord['spec'])];
    const c = await compareRuleSets(input, after, { seed: 1, touches: (id) => id === 2 }, run);
    expect(c.identical).toBe(false);
    const removed = c.changes.filter((x) => x.before.includes('Paneer'));
    expect(removed.length).toBeGreaterThan(0);
    expect(removed.every((x) => x.touchedByRule)).toBe(true);
  });
});

describe('pendingRules', () => {
  const daysRule = rule(10, 2, { template: 'allowed_days', params: { match: is('id', 2), days: ['monday'] } } as RuleRecord['spec'], false);
  const excludeRule = rule(11, 2, { template: 'exclude', params: { match: is('id', 2) } } as RuleRecord['spec']);
  const otherDish = rule(12, 3, { template: 'exclude', params: { match: is('id', 3) } } as RuleRecord['spec']);
  const handWritten = rule(13, undefined, { template: 'exclude', params: { match: is('id', 2) } } as RuleRecord['spec']);
  const rules = [daysRule, excludeRule, otherDish, handWritten];

  it('replaces the rule in a changed slot, keeping its id, state and date', () => {
    const changes = { allowed_days: ownedChanges('curry', { ...NONE, days: ['friday'] }).allowed_days };
    const out = pendingRules(rules, 2, changes, 'Paneer');
    const replaced = out.find((r) => r.id === 10)!;
    expect(replaced.spec.params).toMatchObject({ days: ['friday'] });
    expect(replaced.enabled).toBe(false);
    expect(replaced.created_at).toBe('then');
    expect(out).toHaveLength(4);
    expect(rules[0].spec.params).toMatchObject({ days: ['monday'] });
  });

  it('removes only the dish own rule when a slot is cleared', () => {
    const out = pendingRules(rules, 2, { exclude: null }, 'Paneer');
    expect(out.map((r) => r.id)).toEqual([10, 12, 13]);
  });

  it('adds new rules with ids -1, -2 in slot order and leaves untouched slots alone', () => {
    const built = ownedChanges('curry', { ...NONE, days: ['friday'], neverAuto: true });
    const changes = { allowed_days: built.allowed_days, exclude: built.exclude };
    const links: LinkChange[] = [{ kind: 'add', link: { mode: 'never', target: 'base_category', values: [1], strength: 'always' } }];
    const out = pendingRules([otherDish], 2, changes, 'Paneer', links);
    expect(out.map((r) => r.id)).toEqual([12, -1, -2, -3]);
    expect(out.slice(1).map((r) => r.spec.template)).toEqual(['allowed_days', 'exclude', 'avoid_with']);
    expect(out.slice(1).every((r) => r.enabled && r.owner_component_id === 2)).toBe(true);
  });

  it('pendingRules applies link changes by rule id', () => {
    const comes = (values: number[]): DishLink => ({ mode: 'comes', target: 'extra_dish', values, strength: 'always' });
    const paneer = { id: 2, name: 'Paneer' };
    const a = rule(20, 2, linkRule(paneer, comes([5])).spec, false);
    const b = rule(21, 2, linkRule(paneer, comes([6])).spec);
    const c = rule(22, 2, linkRule(paneer, comes([7])).spec);
    const out = pendingRules([a, b, c, otherDish], 2, {}, 'Paneer', [
      { kind: 'update', ruleId: 20, link: comes([5, 8]) },
      { kind: 'remove', ruleId: 22 },
      { kind: 'add', link: comes([9]) },
    ]);
    expect(out.map((r) => r.id)).toEqual([20, 21, 12, -1]);
    expect(out[0]).toMatchObject({ id: 20, enabled: true, created_at: 'then', name: 'Paneer: comes with' });
    expect(out[0].spec).toEqual(linkRule(paneer, comes([5, 8])).spec);
    expect(out[1]).toBe(b);
    expect(out[3]).toMatchObject({ owner_component_id: 2, enabled: true, spec: linkRule(paneer, comes([9])).spec });
  });

  it('pendingRules leaves another dish\'s rule alone even when named by id', () => {
    const out = pendingRules([otherDish], 2, {}, 'Paneer', [{ kind: 'remove', ruleId: 12 }]);
    expect(out).toEqual([otherDish]);
  });
});
