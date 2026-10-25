import { describe, expect, it } from 'vitest';
import { all, any, compileMatcher, is, matcherFields, MatcherSchema, not, oneOf, TRUE, type Matcher } from './matcher';
import { component } from './test-utils';
import type { Assignment } from './types';

const fishCurry = component('curry', { dietary_tags: ['non-veg'], protein_tag: 'fish', regional_tags: ['coastal-konkan'] });
const plainSubzi = component('subzi'); // no protein_tag
const at = (c: Assignment['c'], role: Assignment['role'] = c.componentType): Assignment =>
  ({ c, role, day: 'friday', meal: 'lunch' });
const test = (m: Matcher, a: Assignment) => compileMatcher(m)(a);

describe('matcher', () => {
  it('matches scalar and set fields with the right operators', () => {
    expect(test(is('protein_tag', 'fish'), at(fishCurry))).toBe(true);
    expect(test(is('dietary_tags', 'non-veg'), at(fishCurry))).toBe(true);
    expect(test(oneOf('regional_tags', ['north-indian', 'coastal-konkan']), at(fishCurry))).toBe(true);
    expect(test({ field: 'dietary_tags', op: 'hasAll', value: ['non-veg', 'veg'] }, at(fishCurry))).toBe(false);
    expect(test(oneOf('day', ['friday', 'saturday']), at(fishCurry))).toBe(true);
    expect(test(is('meal', 'dinner'), at(fishCurry))).toBe(false);
  });

  it('treats a missing scalar as never equal, so neq holds', () => {
    expect(test(is('protein_tag', 'fish'), at(plainSubzi))).toBe(false);
    expect(test({ field: 'protein_tag', op: 'neq', value: 'fish' }, at(plainSubzi))).toBe(true);
    expect(test(oneOf('protein_tag', ['fish', 'dal']), at(plainSubzi))).toBe(false);
  });

  it('combines with all / any / not, where all([]) is true and any([]) is false', () => {
    expect(test(TRUE, at(plainSubzi))).toBe(true);
    expect(test(any(), at(plainSubzi))).toBe(false);
    expect(test(all(is('role', 'curry'), not(is('protein_tag', 'dal'))), at(fishCurry))).toBe(true);
  });

  it('reads role from the assignment, not the component', () => {
    expect(test(is('role', 'extra'), at(fishCurry, 'extra'))).toBe(true);
    expect(test(is('componentType', 'curry'), at(fishCurry, 'extra'))).toBe(true);
  });

  it('lists referenced fields', () => {
    expect([...matcherFields(all(is('day', 'monday'), not(oneOf('id', [1, 2]))))].sort()).toEqual(['day', 'id']);
  });

  it('rejects unknown fields, operators invalid for the field kind, and wrong value types', () => {
    expect(MatcherSchema.safeParse(is('protein_tag', 'fish')).success).toBe(true);
    expect(MatcherSchema.safeParse({ field: 'colour', op: 'eq', value: 'red' }).success).toBe(false);
    expect(MatcherSchema.safeParse({ field: 'dietary_tags', op: 'eq', value: 'veg' }).success).toBe(false);
    expect(MatcherSchema.safeParse({ field: 'protein_tag', op: 'eq', value: 'tofu' }).success).toBe(false);
    expect(MatcherSchema.safeParse({ field: 'id', op: 'in', value: [1, 'x'] }).success).toBe(false);
    expect(MatcherSchema.safeParse({ all: [{ not: { field: 'day', op: 'eq', value: 'funday' } }] }).success).toBe(false);
  });
});
