// The v24 converter: every rule shape the old upgrades and screens stored becomes the shape today's builders write.
import { describe, expect, it } from 'vitest';
import { all, any, is, not, oneOf, type PlannerPart } from '@/planner';
import {
  capRules, defaultRules, describeSpec, libraryNames, linkRule, pairingRule, readLink, RuleSpecSchema, type RuleRecord, type RuleSpec,
} from '@/rules';
import type { CategoryRecord } from '@/types/category';
import type { ComponentRecord } from '@/types/component';
import type { PartRecord } from '@/types/part';
import type { WeeklyPlan } from '@/types/plan';
import { planFromData } from '@/services/plan-generation';
import * as legacy from './legacy-rules';
import { convertRuleSpec, curryTypesNamed, type ConvertRulesContext } from './rules-over-parts';
import stage2 from './__fixtures__/stage2-week.json';

// Part ids unlike their positions, so a position never passes for an id.
const PARTS: PlannerPart[] = [
  { id: 11, name: 'Base', varied: true, legacy: 'base' },
  { id: 12, name: 'Curry', varied: true, legacy: 'curry' },
  { id: 13, name: 'Subzi', varied: true, legacy: 'subzi' },
  { id: 14, name: 'Extras', varied: false, legacy: 'extra' },
];
const [BASE, CURRY, SUBZI, EXTRA] = [11, 12, 13, 14];
const LENTIL = 21, SOUP = 22;
// Dishes: Rice 1 (base), Sambar 2 and Rasam 3 (curry), Beans 4 (subzi), Papad 5 and Pickle 6 (extra). Dish 7 has no part
// of its own (`partOf` was filled from its type, as v24 does).
const ctx: ConvertRulesContext = {
  legacy: { base: BASE, curry: CURRY, subzi: SUBZI, extra: EXTRA },
  parts: PARTS,
  curryCategory: new Map([['lentil', LENTIL], ['soup', SOUP]]),
  partOf: new Map([[1, BASE], [2, CURRY], [3, CURRY], [4, SUBZI], [5, EXTRA], [6, EXTRA]]),
};
const rice = { id: 1, name: 'Rice', part_id: BASE }, sambar = { id: 2, name: 'Sambar', part_id: CURRY };
const beans = { id: 4, name: 'Beans', part_id: SUBZI }, papad = { id: 5, name: 'Papad', part_id: EXTRA };

const converted = (spec: unknown, key?: string): unknown => {
  const out = convertRuleSpec(spec, ctx, key);
  if (!('spec' in out)) throw new Error(`skipped: ${out.skipped}`);
  return out.spec;
};

describe('convertRuleSpec: links', () => {
  // Each old link as v14–v22 and the Stage 2 screens stored it, and the same link as today's builder writes it.
  const cases: [string, legacy.OwnedRule, ReturnType<typeof linkRule>][] = [
    ['served with base dishes', legacy.linkRule(sambar, { mode: 'serve', target: 'base_dish', values: [1], strength: 'usually' }),
      linkRule(sambar, { mode: 'serve', target: { part: BASE, kind: 'dish' }, values: [1], strength: 'usually' }, PARTS)],
    ['served with base categories', legacy.linkRule(beans, { mode: 'serve', target: 'base_category', values: [31, 32], scope: { meals: ['lunch'] } }),
      linkRule(beans, { mode: 'serve', target: { part: BASE, kind: 'category' }, values: [31, 32], scope: { meals: ['lunch'] } }, PARTS)],
    ['comes with a curry', legacy.linkRule(rice, { mode: 'comes', target: 'curry_dish', values: [2, 3] }),
      linkRule(rice, { mode: 'comes', target: { part: CURRY, kind: 'dish' }, values: [2, 3] }, PARTS)],
    ['comes with a curry type', legacy.linkRule(rice, { mode: 'comes', target: 'curry_category', values: ['lentil'], strength: 'sometimes' }),
      linkRule(rice, { mode: 'comes', target: { part: CURRY, kind: 'category' }, values: [LENTIL], strength: 'sometimes' }, PARTS)],
    ['comes with an extra when the curry is Sambar', legacy.linkRule(rice, { mode: 'comes', target: 'extra_dish', values: [5], when: { curry: [2], subzi: [4] } }),
      linkRule(rice, { mode: 'comes', target: { part: EXTRA, kind: 'dish' }, values: [5], when: { [CURRY]: [2], [SUBZI]: [4] } }, PARTS)],
    ['an extra comes with another extra', legacy.linkRule(papad, { mode: 'comes', target: 'extra_dish', values: [6] }),
      linkRule(papad, { mode: 'comes', target: { part: EXTRA, kind: 'dish' }, values: [6] }, PARTS)],
    ['comes with extra categories', legacy.linkRule(sambar, { mode: 'comes', target: 'extra_category', values: [41], scope: { days: ['monday'] } }),
      linkRule(sambar, { mode: 'comes', target: { part: EXTRA, kind: 'category' }, values: [41], scope: { days: ['monday'] } }, PARTS)],
    ['base pairing', legacy.pairingRule(sambar, [31], 'moderately'),
      pairingRule(sambar, [31], PARTS, 'moderately')],
    ['not with base categories', legacy.linkRule(papad, { mode: 'never', target: 'base_category', values: [31] }),
      linkRule(papad, { mode: 'never', target: { part: BASE, kind: 'category' }, values: [31] }, PARTS)],
    ['only with extra categories', legacy.linkRule(rice, { mode: 'with', target: 'extra_category', values: [41, 42] }),
      linkRule(rice, { mode: 'with', target: { part: EXTRA, kind: 'category' }, values: [41, 42] }, PARTS)],
    ['only with these curry types', legacy.linkRule(rice, { mode: 'with', target: 'curry_category', values: ['lentil', 'soup'] }),
      linkRule(rice, { mode: 'with', target: { part: CURRY, kind: 'category' }, values: [LENTIL, SOUP] }, PARTS)],
    ['not with these curries (types)', legacy.curryClashRule(papad, ['soup']),
      linkRule(papad, { mode: 'never', target: { part: CURRY, kind: 'category' }, values: [SOUP] }, PARTS)],
    ['only with these subzis', legacy.linkRule(rice, { mode: 'with', target: 'subzi_dish', values: [4] }),
      linkRule(rice, { mode: 'with', target: { part: SUBZI, kind: 'dish' }, values: [4] }, PARTS)],
    ['never with an extra', legacy.linkRule(sambar, { mode: 'never', target: 'extra_dish', values: [6], strength: 'usually' }),
      linkRule(sambar, { mode: 'never', target: { part: EXTRA, kind: 'dish' }, values: [6], strength: 'usually' }, PARTS)],
  ];

  it.each(cases)('%s', (_, old, today) => {
    expect(converted(old.spec)).toEqual(today.spec);
    expect(RuleSpecSchema.safeParse(converted(old.spec)).success).toBe(true);
  });

  it('a dish that comes with a higher part is added when that part holds it (Papad comes with Sambar)', () => {
    const old = legacy.linkRule(papad, { mode: 'comes', target: 'curry_dish', values: [2, 3], strength: 'moderately', scope: { meals: ['lunch'] } });
    expect(converted(old.spec)).toEqual(linkRule(papad, { mode: 'serve', target: { part: CURRY, kind: 'dish' }, values: [2, 3], strength: 'moderately', scope: { meals: ['lunch'] } }, PARTS).spec);
    const subzi = legacy.linkRule(papad, { mode: 'comes', target: 'subzi_dish', values: [4] });
    expect(converted(subzi.spec)).toEqual(linkRule(papad, { mode: 'serve', target: { part: SUBZI, kind: 'dish' }, values: [4] }, PARTS).spec);
    const types = legacy.linkRule(beans, { mode: 'comes', target: 'curry_category', values: ['lentil'] });
    expect(converted(types.spec)).toEqual(linkRule(beans, { mode: 'serve', target: { part: CURRY, kind: 'category' }, values: [LENTIL] }, PARTS).spec);
  });

  it('a flipped link keeps a hand-set cost exactly', () => {
    const old = legacy.linkRule(papad, { mode: 'comes', target: 'curry_dish', values: [2], strength: 'moderately' });
    old.spec.params.cost = 7;
    expect(converted(old.spec)).toMatchObject({ template: 'require_with', params: { strength: 'prefer', cost: 7 } });
  });

  it('an upward link that also waits for a part cannot be served, so it stays a comes link over parts', () => {
    const old = legacy.linkRule(papad, { mode: 'comes', target: 'subzi_dish', values: [4], when: { curry: [2] } });
    expect(converted(old.spec)).toEqual(linkRule(papad, { mode: 'comes', target: { part: SUBZI, kind: 'dish' }, values: [4], when: { [CURRY]: [2] } }, PARTS).spec);
    expect(readLink({ spec: converted(old.spec) as RuleSpec }, PARTS)).toMatchObject({ mode: 'comes', target: { part: SUBZI, kind: 'dish' } });
  });

  it('a link whose owner or target was deleted keeps the deleted id, and is not flipped without its owner', () => {
    const gone = legacy.linkRule(rice, { mode: 'comes', target: 'extra_dish', values: [999] });
    expect(converted(gone.spec)).toEqual(linkRule(rice, { mode: 'comes', target: { part: EXTRA, kind: 'dish' }, values: [999] }, PARTS).spec);
    const orphan = legacy.linkRule({ id: 998, name: 'Gone' }, { mode: 'comes', target: 'curry_dish', values: [2] });
    expect(converted(orphan.spec)).toMatchObject({ template: 'comes_with', params: { match: is('id', 998), of: all(is('part', CURRY), oneOf('id', [2])) } });
  });

  it('a dish without a part of its own is placed by its type (partOf from componentType)', () => {
    const own = { ...ctx, partOf: new Map([...ctx.partOf, [7, EXTRA]]) };
    const old = legacy.linkRule({ id: 7, name: 'Fryums' }, { mode: 'comes', target: 'curry_dish', values: [2] });
    expect(convertRuleSpec(old.spec, own)).toMatchObject({ spec: { template: 'require_with', params: { components: [7] } } });
  });
});

describe('convertRuleSpec: rules', () => {
  it('turns every type and category leaf into a part or category leaf, however deep', () => {
    const spec = {
      template: 'exclude',
      params: {
        match: any(
          all(is('componentType', 'curry'), not(oneOf('curry_category', ['lentil', 'soup']))),
          all(is('role', 'extra'), is('extra_category_id', 41)),
          { field: 'componentType', op: 'neq', value: 'base' },
          oneOf('base_category_id', [31, 32]),
          is('dietary_tags', 'veg'),
        ),
        strength: 'must',
      },
    };
    expect(converted(spec)).toEqual({
      template: 'exclude',
      params: {
        match: any(
          all(is('part', CURRY), not(oneOf('category', [LENTIL, SOUP]))),
          all(is('part', EXTRA), is('category', 41)),
          { field: 'part', op: 'neq', value: BASE },
          oneOf('category', [31, 32]),
          is('dietary_tags', 'veg'),
        ),
        strength: 'must',
      },
    });
  });

  it('only allow names parts; leave out names parts; also include names categories', () => {
    expect(converted({ template: 'only_allow', params: { match: is('dietary_tags', 'veg'), roles: ['curry', 'subzi'], scope: { days: ['monday'] }, strength: 'prefer', cost: 4 } }))
      .toEqual({ template: 'only_allow', params: { match: is('dietary_tags', 'veg'), parts: [CURRY, SUBZI], scope: { days: ['monday'] }, strength: 'prefer', cost: 4 } });
    expect(converted({ template: 'skip_when', params: { when: is('base_category_id', 32), skip: ['subzi'], strength: 'must' } }))
      .toEqual({ template: 'skip_when', params: { when: is('category', 32), skip: [SUBZI], strength: 'must' } });
    expect(converted({ template: 'require_with', params: { when: is('id', 1), components: [5], extraCategories: [41], strength: 'must' } }))
      .toEqual({ template: 'require_with', params: { when: is('id', 1), components: [5], categories: [41], strength: 'must' } });
  });

  it('a no-repeat counts the parts it named, and base, curry and subzi when it named none', () => {
    expect(converted({ template: 'no_repeat', params: { match: is('dietary_tags', 'non-veg'), within: 3, roles: ['extra'], strength: 'prefer' } }))
      .toEqual({ template: 'no_repeat', params: { match: is('dietary_tags', 'non-veg'), within: 3, parts: [EXTRA], strength: 'prefer' } });
    expect(converted({ template: 'no_repeat', params: { match: is('dietary_tags', 'non-veg'), within: 'week' } }))
      .toEqual({ template: 'no_repeat', params: { match: is('dietary_tags', 'non-veg'), within: 'week', parts: [BASE, CURRY, SUBZI] } });
  });

  it('a stock default becomes today\'s stock default over the parts; an edited one keeps what it says', () => {
    const now = defaultRules(PARTS, { breakfast: 2, lunch: 3, dinner: 3 });
    for (const old of legacy.defaultRules({ breakfast: 2, lunch: 3, dinner: 3 })) {
      expect(converted(old.spec, old.default_key), old.default_key).toEqual(now.find((r) => r.default_key === old.default_key)!.spec);
    }
    const variety = legacy.defaultRules().find((r) => r.default_key === 'variety')!;
    const edited = { ...variety.spec, params: { ...variety.spec.params, cost: 5 } };
    expect(converted(edited, 'variety')).toEqual({ ...now.find((r) => r.default_key === 'variety')!.spec, params: { ...now.find((r) => r.default_key === 'variety')!.spec.params, cost: 5, parts: [BASE, CURRY, SUBZI] } });
    // The same spec without the key is a hand-written rule: it names its parts.
    expect(converted(variety.spec)).toMatchObject({ params: { parts: [BASE, CURRY, SUBZI] } });
  });

  it('the curry and subzi caps become today\'s caps', () => {
    expect(legacy.capRules().map((r) => converted(r.spec))).toEqual(capRules(PARTS).map((r) => r.spec));
  });

  it('a rule already over parts is left as it is', () => {
    for (const r of [...defaultRules(PARTS), ...capRules(PARTS), linkRule(rice, { mode: 'comes', target: { part: EXTRA, kind: 'dish' }, values: [5], when: { [CURRY]: [2] } }, PARTS)]) {
      expect(converted(r.spec, 'default_key' in r ? r.default_key : undefined)).toEqual(r.spec);
    }
  });

  it('a spec that cannot be read even after converting is reported, not guessed at', () => {
    expect(convertRuleSpec({ template: 'no_such', params: {} }, ctx)).toEqual({ skipped: expect.any(String) });
    expect(convertRuleSpec({ template: 'only_allow', params: { match: is('componentType', 'curry'), roles: ['dessert'] } }, ctx)).toEqual({ skipped: expect.any(String) });
    expect(convertRuleSpec({ template: 'exclude', params: { match: is('curry_category', 'egg') } }, ctx)).toEqual({ skipped: expect.stringContaining('egg') });
  });

  it('lists the curry types a spec names, so v24 can give each a category first', () => {
    expect(curryTypesNamed({ template: 'exclude', params: { match: any(is('curry_category', 'egg'), not(oneOf('curry_category', ['fish', 'egg']))) } }).sort()).toEqual(['egg', 'fish']);
    expect(curryTypesNamed(legacy.linkRule(rice, { mode: 'comes', target: 'curry_category', values: ['stew'] }).spec)).toEqual(['stew']);
  });
});

// The fixture was written at bab0681 (Stage 2): a library seeded by that time's `runSeed`, its stored rules plus
// hand-written ones in that time's shapes (links all pointing down), each rule's `describeSpec`, and the weeks
// `planFromData` gave for seeds 1–3. Only `legacy` was added to the parts, as v23 adds it.
describe('converted rules plan as Stage 2 planned the old ones', () => {
  const parts = stage2.parts as PartRecord[];
  const categories = stage2.categories as CategoryRecord[];
  const library = stage2.components as ComponentRecord[];
  const curryCategory = new Map(categories.filter((c) => c.kind === 'curry').map((c) => [c.name, c.id] as [never, number]));
  const fixtureCtx: ConvertRulesContext = {
    legacy: { base: 1, curry: 2, subzi: 3, extra: 4 },
    parts: parts.map((p) => ({ id: p.id, name: p.name, varied: p.varied, legacy: p.legacy })),
    curryCategory,
    partOf: new Map(library.map((c) => [c.id, c.part_id!])),
  };
  const rules = (stage2.rules as RuleRecord[]).map((r) => {
    const out = convertRuleSpec(r.spec, fixtureCtx, r.default_key);
    if (!('spec' in out)) throw new Error(`${r.name}: ${out.skipped}`);
    return { ...r, spec: out.spec as RuleSpec };
  });

  it('every rule converts and still reads the same', () => {
    const names = libraryNames({ dishes: library, categories, parts });
    // A `role` leaf read literally ("Role is extra and …") before; as a part it reads like any other part.
    const RETOLD: Record<number, string> = { 72: 'Extras in the crunchy category: at most 1 per day' };
    for (const r of rules) expect(describeSpec(RuleSpecSchema.parse(r.spec), names), r.name).toBe(RETOLD[r.id] ?? (stage2.descriptions as Record<string, string>)[r.id]);
  });

  it.each([1, 2, 3])('seed %i gives the same week', (seed) => {
    const out = planFromData({ library, categories, rules, parts }, { seed, timeLimitMs: Infinity });
    expect(out.ruleIssues).toEqual([]);
    expect(out.plan.slots).toEqual((stage2.weeks as WeeklyPlan['slots'][])[seed - 1]);
  });
});
