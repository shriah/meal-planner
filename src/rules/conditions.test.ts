import { describe, expect, it } from 'vitest';
import { all, any, is, not, oneOf, TRUE, type Matcher } from '@/planner';
import { fromMatcher, groupProblems, toMatcher, type ConditionGroup } from './conditions';

describe('conditions', () => {
  it('round-trips every shape the editor can show', () => {
    const shapes: Matcher[] = [
      TRUE,
      is('protein_tag', 'fish'),
      oneOf('protein_tag', ['fish', 'chicken']),
      not(is('dietary_tags', 'non-veg')),
      all(is('componentType', 'base'), is('base_category_id', 10)),
      any(is('id', 3), not(oneOf('regional_tags', ['south-indian', 'coastal-konkan']))),
    ];
    for (const m of shapes) {
      const group = fromMatcher(m);
      expect(group, JSON.stringify(m)).not.toBeNull();
      expect(toMatcher(group!)).toEqual(m);
    }
  });

  it('reads neq leaves as "is not"', () => {
    expect(fromMatcher({ field: 'protein_tag', op: 'neq', value: 'fish' })).toEqual({
      join: 'all', conditions: [{ field: 'protein_tag', negate: true, values: ['fish'] }],
    });
  });

  it('refuses matchers that need nesting or fields the editor does not offer, instead of altering them', () => {
    expect(fromMatcher(all(is('id', 1), any(is('id', 2), is('id', 3))))).toBeNull();
    expect(fromMatcher(not(all(is('id', 1), is('id', 2))))).toBeNull();
    expect(fromMatcher(is('meal', 'lunch'))).toBeNull();
    expect(fromMatcher({ field: 'dietary_tags', op: 'hasAll', value: ['veg', 'jain'] })).toBeNull();
    expect(fromMatcher(any())).toBeNull();
  });

  it('builds single, multi-value and negated conditions', () => {
    const group: ConditionGroup = {
      join: 'any',
      conditions: [
        { field: 'componentType', negate: false, values: ['curry'] },
        { field: 'dietary_tags', negate: true, values: ['veg', 'vegan'] },
      ],
    };
    expect(toMatcher(group)).toEqual(any(is('componentType', 'curry'), not(oneOf('dietary_tags', ['veg', 'vegan']))));
  });

  it('flags conditions without values', () => {
    expect(groupProblems({ join: 'all', conditions: [{ field: 'id', negate: false, values: [] }] }))
      .toEqual(['condition 1: choose at least one value']);
  });
});
