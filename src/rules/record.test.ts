import { describe, expect, it } from 'vitest';
import { is } from '@/planner';
import { compileRules, type RuleRecord } from './record';

const known = { components: new Set([1, 2]), baseCategories: new Set([10]), extraCategories: new Set([30]) };
const rule = (id: number, spec: unknown, enabled = true): RuleRecord =>
  ({ id, name: `Rule ${id}`, enabled, spec: spec as RuleRecord['spec'], created_at: '' });

describe('compileRules', () => {
  it('compiles enabled rules with stable ids, the rule name as label and the rule id for explanations', () => {
    const { constraints, issues } = compileRules([
      rule(7, { template: 'skip_when', params: { when: is('id', 1), skip: ['curry', 'subzi'] } }),
      rule(8, { template: 'exclude', params: { match: is('id', 2) } }, false),
    ], known);
    expect(issues).toEqual([]);
    expect(constraints.map((c) => [c.id, c.label, c.ruleId, c.origin])).toEqual([
      ['rule:7:0', 'Rule 7', 7, 'rule'],
      ['rule:7:1', 'Rule 7', 7, 'rule'],
    ]);
  });

  it('skips and reports invalid rules instead of applying them', () => {
    const { constraints, issues } = compileRules([rule(1, { template: 'limit', params: { match: is('id', 1), per: 'week' } })], known);
    expect(constraints).toEqual([]);
    expect(issues).toEqual([{ ruleId: 1, name: 'Rule 1', message: expect.stringContaining('invalid rule') }]);
  });

  it('skips and reports rules that refer to deleted components or categories', () => {
    const { constraints, issues } = compileRules([
      rule(1, { template: 'require_with', params: { when: is('base_category_id', 99), components: [3], extraCategories: [30] } }),
    ], known);
    expect(constraints).toEqual([]);
    expect(issues[0].message).toBe('refers to component #3, base category #99, which no longer exists');
  });

  describe('what gives way to a unit', () => {
    const skip = { template: 'skip_when', params: { when: is('id', 1), skip: ['curry', 'subzi'] } };
    const withKey = (r: RuleRecord, extra: Partial<RuleRecord>): RuleRecord => ({ ...r, ...extra });
    const compile = (r: RuleRecord) => compileRules([r], { ...known, components: new Set([1, 2, 3, 7]) }).constraints;

    it('marks every constraint of an owned rule with its owner and yieldsTo unit', () => {
      const cs = compile(withKey(rule(1, skip), { owner_component_id: 7 }));
      expect(cs).toHaveLength(2);
      for (const c of cs) expect(c).toMatchObject({ owner: 7, yieldsTo: 'unit' });
    });

    it('variety and spacing give way to asked-for sides', () => {
      for (const key of ['variety', 'spacing']) {
        const [c] = compile(withKey(rule(1, skip), { default_key: key }));
        expect(c).toMatchObject({ yieldsTo: 'ask' });
        expect(c).not.toHaveProperty('owner');
      }
    });

    it('extras caps give way to a unit only; prefer-frequent and avoid-rare to asked sides', () => {
      for (const key of ['extras-limit-breakfast', 'extras-limit-lunch', 'extras-limit-dinner']) {
        const limit = { template: 'limit', params: { match: is('componentType', 'extra'), per: 'meal', max: 2, strength: 'must' } };
        expect(compile(withKey(rule(1, limit), { default_key: key }))[0]).toMatchObject({ yieldsTo: 'unit' });
      }
      for (const key of ['prefer-frequent', 'avoid-rare']) {
        const prefer = { template: 'prefer', params: { match: is('frequency', 'frequent'), direction: 'prefer', weight: 1 } };
        expect(compile(withKey(rule(1, prefer), { default_key: key }))[0]).toMatchObject({ yieldsTo: 'ask' });
      }
    });

    it('sides-only-when-asked yields to an ask', () => {
      expect(compile(withKey(rule(2, skip), { default_key: 'sides-only-when-asked' }))[0]).toMatchObject({ yieldsTo: 'ask' });
    });

    it('hand-written frequency rules give way to asked sides; other hand-written rules are unmarked', () => {
      const [weekly] = compile(rule(1, { template: 'limit', params: { match: is('id', 1), per: 'week', max: 3 } }));
      expect(weekly).toMatchObject({ yieldsTo: 'ask' });
      expect(weekly).not.toHaveProperty('owner');

      const [exclude] = compile(rule(1, { template: 'exclude', params: { match: is('id', 1) } }));
      expect(exclude).not.toHaveProperty('yieldsTo');
      expect(exclude).not.toHaveProperty('owner');

      const [perMeal] = compile(rule(1, { template: 'limit', params: { match: is('id', 1), per: 'meal', max: 1 } }));
      expect(perMeal).not.toHaveProperty('yieldsTo');

      const [prefer] = compile(rule(1, { template: 'prefer', params: { match: is('id', 1), direction: 'prefer' } }));
      expect(prefer).toMatchObject({ kind: 'prefer', yieldsTo: 'ask' });
    });

    it('splits a frequency rule with a minimum: the minimum still counts a brought dish, the maximum gives way', () => {
      const cs = compile(rule(4, { template: 'limit', params: { match: is('id', 1), per: 'week', min: 1, max: 3, strength: 'must' } }));
      expect(cs.map((c) => [c.id, c.kind === 'count' && c.bounds])).toEqual([
        ['rule:4:0', { hardMin: 1 }],
        ['rule:4:0:max', { hardMax: 3 }],
      ]);
      expect(cs[0]).not.toHaveProperty('yieldsTo');
      expect(cs[1]).toMatchObject({ yieldsTo: 'ask' });
    });

    it("an owned rule's frequency constraints give way to asked sides and keep the owner", () => {
      const cs = compile(withKey(rule(1, { template: 'limit', params: { match: is('id', 7), per: 'week', max: 2 } }), { owner_component_id: 7 }));
      expect(cs).toEqual([expect.objectContaining({ owner: 7, yieldsTo: 'ask' })]);
    });

    it('compiles an owned serve rule to a pair with neither field', () => {
      const [pair] = compile(withKey(rule(1, { template: 'require_with', params: { when: is('id', 1), components: [7] } }), { owner_component_id: 7 }));
      expect(pair.kind).toBe('pair');
      expect(pair).not.toHaveProperty('yieldsTo');
      expect(pair).not.toHaveProperty('owner');
    });

    it('emits constraints in ascending rule id order even when rules arrive out of order', () => {
      const pairSpec = { template: 'require_with', params: { when: is('id', 1), components: [2] } };
      const { constraints } = compileRules([rule(9, pairSpec), rule(3, pairSpec), rule(5, pairSpec)], known);
      expect(constraints.map((c) => c.ruleId)).toEqual([3, 5, 9]);
    });
  });
});
