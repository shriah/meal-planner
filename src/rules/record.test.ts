import { describe, expect, it } from 'vitest';
import { is } from '@/planner';
import { compileRules, ruleLevel, type RuleRecord } from './record';
import { defaultRules } from './defaults';

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

    it('marks every constraint of an owned rule with its owner and the dish level', () => {
      const cs = compile(withKey(rule(1, skip), { owner_component_id: 7 }));
      expect(cs).toHaveLength(2);
      for (const c of cs) expect(c).toMatchObject({ owner: 7, level: 'dish' });
    });

    it('variety and spacing give way to asked-for sides', () => {
      for (const key of ['variety', 'spacing']) {
        const [c] = compile(withKey(rule(1, skip), { default_key: key }));
        expect(c).toMatchObject({ level: 'frequency' });
        expect(c).not.toHaveProperty('owner');
      }
    });

    it('extras caps give way to a unit only; prefer-frequent and avoid-rare to asked sides', () => {
      for (const key of ['extras-limit-breakfast', 'extras-limit-lunch', 'extras-limit-dinner']) {
        const limit = { template: 'limit', params: { match: is('componentType', 'extra'), per: 'meal', max: 2, strength: 'must' } };
        expect(compile(withKey(rule(1, limit), { default_key: key }))[0]).toMatchObject({ level: 'dish' });
      }
      for (const key of ['prefer-frequent', 'avoid-rare']) {
        const prefer = { template: 'prefer', params: { match: is('frequency', 'frequent'), direction: 'prefer', weight: 1 } };
        expect(compile(withKey(rule(1, prefer), { default_key: key }))[0]).toMatchObject({ level: 'frequency' });
      }
    });

    it('sides-only-when-asked yields to an ask', () => {
      expect(compile(withKey(rule(2, skip), { default_key: 'sides-only-when-asked' }))[0]).toMatchObject({ level: 'frequency' });
    });

    it('hand-written frequency rules give way to asked sides; other hand-written rules are unmarked', () => {
      const [weekly] = compile(rule(1, { template: 'limit', params: { match: is('id', 1), per: 'week', max: 3 } }));
      expect(weekly).toMatchObject({ level: 'frequency' });
      expect(weekly).not.toHaveProperty('owner');

      const [exclude] = compile(rule(1, { template: 'exclude', params: { match: is('id', 1) } }));
      expect(exclude).toMatchObject({ level: 'rule' });
      expect(exclude).not.toHaveProperty('owner');

      const [perMeal] = compile(rule(1, { template: 'limit', params: { match: is('id', 1), per: 'meal', max: 1 } }));
      expect(perMeal).toMatchObject({ level: 'rule' });

      const [prefer] = compile(rule(1, { template: 'prefer', params: { match: is('id', 1), direction: 'prefer' } }));
      expect(prefer).toMatchObject({ kind: 'prefer', level: 'frequency' });
    });

    it('splits a frequency rule with a minimum: the minimum still counts a brought dish, the maximum gives way', () => {
      const cs = compile(rule(4, { template: 'limit', params: { match: is('id', 1), per: 'week', min: 1, max: 3, strength: 'must' } }));
      expect(cs.map((c) => [c.id, c.kind === 'count' && c.bounds])).toEqual([
        ['rule:4:0', { hardMin: 1 }],
        ['rule:4:0:max', { hardMax: 3 }],
      ]);
      expect(cs[0]).toMatchObject({ level: 'rule' });
      expect(cs[1]).toMatchObject({ level: 'frequency' });
    });

    it("an owned rule's frequency constraints give way to asked sides and keep the owner", () => {
      const cs = compile(withKey(rule(1, { template: 'limit', params: { match: is('id', 7), per: 'week', max: 2 } }), { owner_component_id: 7 }));
      expect(cs).toEqual([expect.objectContaining({ owner: 7, level: 'frequency' })]);
    });

    it('compiles an owned serve rule to a pair with no level and no owner', () => {
      const [pair] = compile(withKey(rule(1, { template: 'require_with', params: { when: is('id', 1), components: [7] } }), { owner_component_id: 7 }));
      expect(pair.kind).toBe('pair');
      expect(pair).not.toHaveProperty('level');
      expect(pair).not.toHaveProperty('owner');
    });

    it('emits constraints in ascending rule id order even when rules arrive out of order', () => {
      const pairSpec = { template: 'require_with', params: { when: is('id', 1), components: [2] } };
      const { constraints } = compileRules([rule(9, pairSpec), rule(3, pairSpec), rule(5, pairSpec)], known);
      expect(constraints.map((c) => c.ruleId)).toEqual([3, 5, 9]);
    });
  });
});

describe('the level each compiled rule sits on', () => {
  const lib = { ...known, components: new Set([1, 2, 3, 7]) };
  const compile = (r: RuleRecord) => compileRules([r], lib).constraints;
  const levelsOf = (r: RuleRecord) => compile(r).map((c) => [c.id, 'level' in c ? c.level : undefined]);

  it('a hand-written per-meal limit is on the rule level', () => {
    expect(levelsOf(rule(1, { template: 'limit', params: { match: is('id', 1), per: 'meal', max: 2 } }))).toEqual([['rule:1:0', 'rule']]);
  });

  it('a per-week limit with both bounds splits: the minimum is a rule, the maximum is frequency', () => {
    const cs = compile(rule(1, { template: 'limit', params: { match: is('id', 1), per: 'week', min: 1, max: 3 } }));
    expect(cs.map((c) => [c.id, 'level' in c ? c.level : undefined])).toEqual([['rule:1:0', 'rule'], ['rule:1:0:max', 'frequency']]);
    expect(cs[0]).toMatchObject({ bounds: { hardMin: 1 } });
    expect(cs[1]).toMatchObject({ bounds: { hardMax: 3 } });
  });

  it('a per-week limit with only a minimum stays one rule-level body', () => {
    expect(levelsOf(rule(1, { template: 'limit', params: { match: is('id', 1), per: 'week', min: 1 } }))).toEqual([['rule:1:0', 'rule']]);
  });

  it('an owned rule is on the dish level and keeps its owner; an owned prefer is frequency', () => {
    const allowed = { ...rule(1, { template: 'allowed_days', params: { match: is('id', 1), days: ['monday'] } }), owner_component_id: 7 };
    expect(compile(allowed)).toMatchObject([{ level: 'dish', owner: 7 }]);
    const prefer = { ...rule(2, { template: 'prefer', params: { match: is('id', 1), direction: 'prefer' } }), owner_component_id: 7 };
    expect(compile(prefer)).toMatchObject([{ level: 'frequency', owner: 7 }]);
  });

  it('default rules sit where the design puts them', () => {
    const level = (key: string) => {
      const d = defaultRules().find((r) => r.default_key === key)!;
      const [c] = compile({ ...d, id: 1, enabled: true, created_at: '' });
      return 'level' in c ? c.level : undefined;
    };
    expect(level('extras-limit-lunch')).toBe('dish');
    for (const key of ['variety', 'spacing', 'sides-only-when-asked', 'prefer-frequent', 'avoid-rare']) expect(level(key)).toBe('frequency');
    const want = { ...rule(1, { template: 'require', params: { match: is('componentType', 'curry') } }), default_key: 'want-curry' };
    expect(compile(want)).toMatchObject([{ level: 'dish' }]);
  });

  it('pairs carry no level', () => {
    const [c] = compile(rule(1, { template: 'comes_with', params: { match: is('id', 1), of: { all: [is('componentType', 'curry'), is('id', 2)] } } }));
    expect(c.kind).toBe('pair');
    expect(c).not.toHaveProperty('level');
    const [d] = compile(rule(2, { template: 'require_with', params: { when: is('id', 1), components: [2] } }));
    expect(d).not.toHaveProperty('level');
  });
});

describe('ruleLevel', () => {
  it('names what a rule gives way to', () => {
    expect(ruleLevel(rule(1, { template: 'exclude', params: { match: is('id', 1), strength: 'must' } }))).toBe('rule');
    expect(ruleLevel(rule(2, { template: 'limit', params: { match: is('id', 1), per: 'week', min: 1, max: 3 } }))).toBe('frequency');
    expect(ruleLevel(rule(3, { template: 'require_with', params: { when: is('id', 1), components: [2] } }))).toBe('bring');
    const d = defaultRules().find((r) => r.default_key === 'extras-limit-lunch')!;
    expect(ruleLevel({ ...d, id: 4, enabled: true, created_at: '' })).toBe('dish');
    expect(ruleLevel(rule(5, { template: 'nope' }))).toBeUndefined();
  });
});
