import { describe, expect, it } from 'vitest';
import { is, matcherFields, type Constraint, type Matcher } from '@/planner';
import { compileRules, ruleLevel, type RuleRecord } from './record';
import { defaultRules } from './defaults';
import { linkRule } from './owned';
import { TEST_RULE_PARTS } from './test-parts';

const known = { components: new Set([1, 2]), baseCategories: new Set([10]), extraCategories: new Set([30]) };
const rule = (id: number, spec: unknown, enabled = true): RuleRecord =>
  ({ id, name: `Rule ${id}`, enabled, spec: spec as RuleRecord['spec'], created_at: '' });

describe('compileRules', () => {
  it('compiles enabled rules with stable ids, the rule name as label and the rule id for explanations', () => {
    const { constraints, issues } = compileRules([
      rule(7, { template: 'skip_when', params: { when: is('id', 1), skip: ['curry', 'subzi'] } }),
      rule(8, { template: 'exclude', params: { match: is('id', 2) } }, false),
    ], known, TEST_RULE_PARTS);
    expect(issues).toEqual([]);
    expect(constraints.map((c) => [c.id, c.label, c.ruleId, c.origin])).toEqual([
      ['rule:7:0', 'Rule 7', 7, 'rule'],
      ['rule:7:1', 'Rule 7', 7, 'rule'],
    ]);
  });

  it('skips and reports invalid rules instead of applying them', () => {
    const { constraints, issues } = compileRules([rule(1, { template: 'limit', params: { match: is('id', 1), per: 'week' } })], known, TEST_RULE_PARTS);
    expect(constraints).toEqual([]);
    expect(issues).toEqual([{ ruleId: 1, name: 'Rule 1', message: expect.stringContaining('invalid rule') }]);
  });

  it('skips and reports rules that refer to deleted components or categories', () => {
    const { constraints, issues } = compileRules([
      rule(1, { template: 'require_with', params: { when: is('base_category_id', 99), components: [3], extraCategories: [30] } }),
    ], known, TEST_RULE_PARTS);
    expect(constraints).toEqual([]);
    expect(issues[0].message).toBe('refers to component #3, base category #99, which no longer exists');
  });

  it('skips and reports a rule naming slot_part, which the planner cannot match, and still compiles the others', () => {
    const { constraints, issues } = compileRules([
      rule(1, { template: 'exclude', params: { match: is('slot_part', 2) } }),
      rule(2, { template: 'exclude', params: { match: is('id', 1) } }),
    ], known, TEST_RULE_PARTS);
    expect(issues).toEqual([{ ruleId: 1, name: 'Rule 1', message: expect.stringContaining('"slot_part"') }]);
    expect(constraints.map((c) => c.ruleId)).toEqual([2]);
  });

  describe('what gives way to a unit', () => {
    const skip = { template: 'skip_when', params: { when: is('id', 1), skip: ['curry', 'subzi'] } };
    const withKey = (r: RuleRecord, extra: Partial<RuleRecord>): RuleRecord => ({ ...r, ...extra });
    const compile = (r: RuleRecord) => compileRules([r], { ...known, components: new Set([1, 2, 3, 7]) }, TEST_RULE_PARTS).constraints;

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
      const { constraints } = compileRules([rule(9, pairSpec), rule(3, pairSpec), rule(5, pairSpec)], known, TEST_RULE_PARTS);
      expect(constraints.map((c) => c.ruleId)).toEqual([3, 5, 9]);
    });
  });
});

describe('the level each compiled rule sits on', () => {
  const lib = { ...known, components: new Set([1, 2, 3, 7]) };
  const compile = (r: RuleRecord) => compileRules([r], lib, TEST_RULE_PARTS).constraints;
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

describe('compiled rules are about parts', () => {
  const fieldsOf = (c: Constraint): Set<string> => {
    const out = new Set<string>();
    const add = (m: Matcher) => matcherFields(m).forEach((f) => out.add(f));
    if (c.kind === 'pair') [c.when, c.of, ...(c.inMeal ?? [])].forEach(add);
    else {
      add(c.select);
      if (c.kind === 'count' && c.when) add(c.when.exists);
    }
    return out;
  };
  const records = (...specs: RuleRecord[]) => specs.map((r, i) => ({ ...r, id: i + 1 }));
  const stored = (name: string, r: { name: string; spec: RuleRecord['spec']; default_key?: string; owner_component_id?: number }): RuleRecord =>
    ({ ...r, id: 0, enabled: true, created_at: '', name });
  const defaults = defaultRules().map((r) => stored(r.name, r as never));
  const lib = { components: new Set([1, 2, 3]), baseCategories: new Set<number>(), extraCategories: new Set<number>() };
  const link = linkRule({ id: 1, name: 'Plain Rice' }, { mode: 'comes', target: 'extra_dish', values: [3], when: { curry: [2] } });

  it('leaves no role or componentType leaf in the defaults and a conditional link', () => {
    const { constraints, issues } = compileRules(records(stored('Plain Rice link', link), ...defaults), lib, TEST_RULE_PARTS);
    expect(issues).toEqual([]);
    expect(constraints.length).toBeGreaterThan(8);
    for (const c of constraints) {
      const fields = fieldsOf(c);
      expect(fields.has('role'), c.id).toBe(false);
      expect(fields.has('componentType'), c.id).toBe(false);
    }
    expect(constraints.some((c) => c.kind === 'pair' && fieldsOf(c).has('part'))).toBe(true);
  });

  const selectOf = (key: string, parts = TEST_RULE_PARTS) => {
    const rule = defaults.find((r) => r.default_key === key)!;
    const { constraints } = compileRules(records(rule), lib, parts);
    return constraints.map((c) => (c.kind === 'pair' ? undefined : c.select));
  };

  // A no-repeat select is the match, then the roles it covers (every part here).
  const repeated = (ids: number[]) => ({ all: [{ field: 'part', op: 'in', value: ids }, { field: 'part', op: 'in', value: [1, 2, 3, 4] }] });

  it('variety and spacing name the varied parts, and sides-only names every part after the first', () => {
    expect(selectOf('variety')).toEqual([repeated([1, 2, 3])]);
    expect(selectOf('spacing')).toEqual([repeated([1, 2, 3])]);
    expect(selectOf('sides-only-when-asked')).toEqual([{ field: 'part', op: 'in', value: [2, 3, 4] }]);
  });

  it('a part that is not varied is left out of variety and spacing', () => {
    const parts = { ...TEST_RULE_PARTS, list: TEST_RULE_PARTS.list.map((p) => (p.name === 'Subzi' ? { ...p, varied: false } : p)) };
    expect(selectOf('variety', parts)).toEqual([repeated([1, 2])]);
    expect(selectOf('spacing', parts)).toEqual([repeated([1, 2])]);
  });

  it('plans an edited default as stored: only its component types become parts', () => {
    const rule = defaults.find((r) => r.default_key === 'variety')!;
    const edited = { ...rule, spec: { template: 'no_repeat', params: { match: is('componentType', 'curry'), within: 'week', strength: 'prefer', cost: 5, roles: ['curry'] } } } as RuleRecord;
    const { constraints } = compileRules(records(edited), lib, TEST_RULE_PARTS);
    expect(constraints.map((c) => (c.kind === 'pair' ? undefined : c.select))).toEqual([
      { all: [{ field: 'part', op: 'eq', value: 2 }, { field: 'part', op: 'in', value: [2] }] },
    ]);
    const sides = defaults.find((r) => r.default_key === 'sides-only-when-asked')!;
    const narrowed = { ...sides, spec: { ...sides.spec, params: { ...sides.spec.params, match: is('componentType', 'extra') } } } as RuleRecord;
    expect(compileRules(records(narrowed), lib, TEST_RULE_PARTS).constraints.map((c) => (c.kind === 'pair' ? undefined : c.select)))
      .toEqual([{ field: 'part', op: 'eq', value: 4 }]);
  });

  it('does not change the stored rule', () => {
    const rule = defaults.find((r) => r.default_key === 'variety')!;
    const before = JSON.stringify(rule);
    compileRules(records(rule), lib, TEST_RULE_PARTS);
    expect(JSON.stringify(rule)).toBe(before);
  });

  it('skips and names a rule over a component type when there are no legacy part ids to read it by', () => {
    const noLegacy = { list: TEST_RULE_PARTS.list };
    const old = rule(1, { template: 'limit', params: { match: is('componentType', 'base'), per: 'meal', max: 1, strength: 'must' } });
    const byPart = rule(2, { template: 'limit', params: { match: is('part', 1), per: 'meal', max: 1, strength: 'must' } });
    const { constraints, issues } = compileRules([old, byPart], known, noLegacy);
    expect(issues).toEqual([expect.objectContaining({ ruleId: 1, message: expect.stringContaining('"componentType"') })]);
    expect(constraints.map((c) => c.ruleId)).toEqual([2]);
    const category = rule(3, { template: 'limit', params: { match: is('base_category_id', 10), per: 'meal', max: 1, strength: 'must' } });
    expect(compileRules([category], known, noLegacy).issues).toHaveLength(1);
    expect(compileRules([old], known, TEST_RULE_PARTS).issues).toEqual([]);
  });
});
