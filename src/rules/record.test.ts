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

    it('extras caps and prefer-frequent give way to a unit only', () => {
      for (const key of ['extras-limit-breakfast', 'extras-limit-lunch', 'extras-limit-dinner', 'prefer-frequent']) {
        expect(compile(withKey(rule(1, skip), { default_key: key }))[0]).toMatchObject({ yieldsTo: 'unit' });
      }
    });

    it('sides-only-when-asked yields to an ask', () => {
      expect(compile(withKey(rule(2, skip), { default_key: 'sides-only-when-asked' }))[0]).toMatchObject({ yieldsTo: 'ask' });
    });

    it('leaves hand-written rules unmarked', () => {
      const [c] = compile(rule(1, skip));
      expect(c).not.toHaveProperty('yieldsTo');
      expect(c).not.toHaveProperty('owner');
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
