import { describe, expect, it } from 'vitest';
import { linkRule, remapSpec } from './legacy-rules';

describe('remapSpec', () => {
  it("points a comes-with link's condition at the kept copy of a merged curry or subzi", () => {
    const maps = { component: new Map([[11, 10], [21, 20], [31, 30]]), baseCategory: new Map(), extraCategory: new Map() };
    const rule = linkRule({ id: 1, name: 'Rice' }, { mode: 'comes', target: 'extra_dish', values: [31], strength: 'always', when: { curry: [10, 11, 12], subzi: [21] } });
    expect(remapSpec(rule.spec, maps)).toEqual(linkRule({ id: 1, name: 'Rice' }, { mode: 'comes', target: 'extra_dish', values: [30], strength: 'always', when: { curry: [10, 12], subzi: [20] } }).spec);
  });

  it('still remaps a served-with matcher named when', () => {
    const maps = { component: new Map([[11, 10]]), baseCategory: new Map(), extraCategory: new Map() };
    const rule = linkRule({ id: 5, name: 'Sambar' }, { mode: 'serve', target: 'base_dish', values: [11], strength: 'always' });
    expect(remapSpec(rule.spec, maps)).toEqual(linkRule({ id: 5, name: 'Sambar' }, { mode: 'serve', target: 'base_dish', values: [10], strength: 'always' }).spec);
  });
});
