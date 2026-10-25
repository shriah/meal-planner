import { describe, expect, it } from 'vitest';
import { all, any, is, not, oneOf, TRUE } from '@/planner';
import { describeMatcher, describeScope } from './describe';

const names = { component: (id: number) => ({ 1: 'Sambar', 2: 'Rasam' })[id], baseCategory: () => 'Rice-based', extraCategory: () => 'Liquid' };
const d = (m: Parameters<typeof describeMatcher>[0]) => describeMatcher(m, names);

describe('describeMatcher', () => {
  it('reads conditions as a noun phrase', () => {
    expect(d(TRUE)).toBe('any dish');
    expect(d(is('componentType', 'curry'))).toBe('curries');
    expect(d(all(is('componentType', 'curry'), is('dietary_tags', 'non-veg'), is('protein_tag', 'fish')))).toBe('non-veg curries with fish');
    expect(d(all(is('componentType', 'base'), is('base_category_id', 10)))).toBe('bases in the Rice-based category');
    expect(d(oneOf('id', [1, 2]))).toBe('Sambar or Rasam');
    expect(d(all(is('componentType', 'subzi'), not(is('protein_tag', 'paneer'))))).toBe('subzis without paneer');
    expect(d(not(is('dietary_tags', 'non-veg')))).toBe('dishes that are not non-veg');
    expect(d(oneOf('componentType', ['curry', 'subzi']))).toBe('curries or subzis');
  });

  it('joins "any" groups with or', () => {
    expect(d(any(is('id', 1), is('protein_tag', 'dal')))).toBe('Sambar or dishes with dal');
  });

  it('falls back to a literal reading for nested matchers', () => {
    expect(d(all(is('id', 1), any(is('protein_tag', 'dal'), is('protein_tag', 'fish'))))).toBe('Sambar and (protein is dal or protein is fish)');
  });
});

describe('describeScope', () => {
  it('lists days and meals', () => {
    expect(describeScope({ days: ['friday', 'saturday', 'sunday'], meals: ['lunch'] })).toBe(' on Friday, Saturday or Sunday at lunch');
    expect(describeScope(undefined)).toBe('');
  });
});
