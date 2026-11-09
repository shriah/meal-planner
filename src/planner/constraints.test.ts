import { describe, expect, it } from 'vitest';
import { ConstraintSchema, type CountConstraint } from './constraints';
import { is } from './matcher';

const base: CountConstraint = {
  kind: 'count', id: 'c', label: 'Test', origin: 'rule', select: is('role', 'curry'), groupBy: 'slot', bounds: { hardMax: 1 },
};
const valid = (c: object) => ConstraintSchema.safeParse({ ...base, ...c }).success;

describe('constraint schema', () => {
  it('accepts well-formed constraints', () => {
    expect(valid({})).toBe(true);
    expect(valid({ groupBy: ['component', { days: 3 }], bounds: { hardMax: 1 } })).toBe(true);
    expect(valid({ groupBy: 'plan', bounds: { hardMin: 1, softMin: 2, softMax: 4, hardMax: 5 } })).toBe(true);
    expect(valid({ scope: { days: ['friday'], meals: ['lunch'] } })).toBe(true);
  });

  it('requires at least one bound, in order', () => {
    expect(valid({ bounds: {} })).toBe(false);
    expect(valid({ bounds: { hardMin: 3, hardMax: 2 } })).toBe(false);
    expect(valid({ bounds: { softMax: 4, hardMax: 2 } })).toBe(false);
  });

  it('rejects minimum bounds on per-component groups, which could never fire', () => {
    expect(valid({ groupBy: 'component', bounds: { hardMin: 1 } })).toBe(false);
  });

  it('rejects scopes the group cannot honour instead of ignoring them', () => {
    expect(valid({ groupBy: 'plan', scope: { days: ['monday'] } })).toBe(false);
    expect(valid({ groupBy: ['component', { days: 2 }], scope: { days: ['monday'] } })).toBe(false);
    expect(valid({ groupBy: 'day', scope: { meals: ['lunch'] } })).toBe(false);
    expect(valid({ groupBy: 'meal', scope: { days: ['monday'] } })).toBe(false);
  });

  it('rejects unknown keys and invalid windows', () => {
    expect(valid({ hardWeight: 5 })).toBe(false);
    expect(valid({ groupBy: { days: 8 } })).toBe(false);
  });

  it('validates prefer constraints', () => {
    expect(ConstraintSchema.safeParse({ kind: 'prefer', id: 'p', label: 'P', origin: 'rule', select: is('role', 'extra'), weight: -2 }).success).toBe(true);
    expect(ConstraintSchema.safeParse({ kind: 'prefer', id: 'p', label: 'P', origin: 'rule', select: is('role', 'extra'), weight: Infinity }).success).toBe(false);
  });

  it('validates pair constraints', () => {
    const pair = { kind: 'pair', id: 'x', label: 'Served with', origin: 'rule', when: is('id', 1), of: is('id', 2), strength: 'must' };
    expect(ConstraintSchema.safeParse(pair).success).toBe(true);
    expect(ConstraintSchema.safeParse({ ...pair, strength: 'prefer' }).success).toBe(true);
    expect(ConstraintSchema.safeParse({ ...pair, strength: 'prefer', cost: 4, scope: { meals: ['breakfast'] } }).success).toBe(true);
    expect(ConstraintSchema.safeParse({ ...pair, bounds: { hardMin: 1 } }).success).toBe(false);
    expect(ConstraintSchema.safeParse({ ...pair, cost: 11 }).success).toBe(false);
    expect(ConstraintSchema.safeParse({ ...pair, of: undefined, component: 2 }).success).toBe(false);
  });

  it('accepts giving way on count and prefer constraints', () => {
    expect(valid({ yieldsTo: 'unit', owner: 3 })).toBe(true);
    expect(valid({ yieldsTo: 'ask' })).toBe(true);
    expect(valid({ yieldsTo: 'always' })).toBe(false);
  });
});
