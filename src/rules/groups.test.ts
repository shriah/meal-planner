import { describe, expect, it } from 'vitest';
import { groupRules } from './groups';
import type { RuleRecord } from './record';

const rule = (id: number, extra: Partial<RuleRecord> = {}): RuleRecord => ({
  id, name: `Rule ${id}`, enabled: true, created_at: '', spec: { template: 'exclude', params: { match: { all: [] } } }, ...extra,
});

describe('groupRules', () => {
  it('splits rules into the user\'s own, planner defaults and dish settings, keeping order', () => {
    const rules = [
      rule(1), rule(2, { default_key: 'variety' }), rule(3, { owner_component_id: 9 }), rule(4), rule(5, { default_key: 'spacing' }),
    ];
    const g = groupRules(rules);
    expect(g.mine.map((r) => r.id)).toEqual([1, 4]);
    expect(g.defaults.map((r) => r.id)).toEqual([2, 5]);
    expect(g.dish.map((r) => r.id)).toEqual([3]);
  });

  it('counts a rule that is both owned and a default as a dish setting', () => {
    const g = groupRules([rule(1, { owner_component_id: 2, default_key: 'variety' })]);
    expect(g.dish).toHaveLength(1);
    expect(g.defaults).toHaveLength(0);
  });

  it('handles no rules', () => {
    expect(groupRules([])).toEqual({ mine: [], defaults: [], dish: [] });
  });
});
