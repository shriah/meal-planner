import { describe, expect, it } from 'vitest';
import { describeLink, shortLink } from './link-text';
import type { DishLink } from './owned';

const names = {
  component: (id: number) => ({ 1: 'Idli', 2: 'Dosa', 3: 'Poori', 4: 'Rice', 5: 'Roti' } as Record<number, string>)[id],
  baseCategory: (id: number) => ({ 1: 'Rice-based', 2: 'Roti-based' } as Record<number, string>)[id],
  extraCategory: (id: number) => ({ 1: 'Soup' } as Record<number, string>)[id],
};
const link = (over: Partial<DishLink>): DishLink => ({ mode: 'with', target: 'base_dish', values: [1, 2], strength: 'always', ...over });

describe('describeLink', () => {
  it('words each strength', () => {
    expect(describeLink('Sambar', link({ strength: 'always' }), names)).toBe('Sambar is always planned only with Idli or Dosa');
    expect(describeLink('Sambar', link({ strength: 'usually' }), names)).toBe('Sambar is usually planned only with Idli or Dosa');
    expect(describeLink('Sambar', link({ strength: 'moderately' }), names)).toBe('Sambar is often planned only with Idli or Dosa');
    expect(describeLink('Sambar', link({ strength: 'sometimes' }), names)).toBe('Sambar is sometimes planned only with Idli or Dosa');
  });

  it('words each mode', () => {
    expect(describeLink('Sambar', link({ mode: 'never', strength: 'usually' }), names)).toBe('Sambar is usually kept away from Idli or Dosa');
    expect(describeLink('Soup', link({ mode: 'never', target: 'extra_category', values: [1] }), names)).toBe('Soup is always kept away from Soup');
  });

  it('adds days and meals', () => {
    const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
    expect(describeLink('Sambar', link({ strength: 'usually', scope: { days: [...weekdays], meals: ['breakfast'] } }), names))
      .toBe('Sambar is usually planned only with Idli or Dosa, on weekdays at breakfast');
    expect(describeLink('Sambar', link({ scope: { days: ['monday', 'friday'] } }), names)).toBe('Sambar is always planned only with Idli or Dosa, on Mon, Fri');
    expect(describeLink('Sambar', link({ scope: { meals: ['breakfast', 'dinner'] } }), names)).toBe('Sambar is always planned only with Idli or Dosa, at breakfast or dinner');
    expect(describeLink('Sambar', link({ scope: { days: ['saturday', 'sunday'] } }), names)).toBe('Sambar is always planned only with Idli or Dosa, on weekends');
  });

  it('names deleted values', () => {
    expect(describeLink('Sambar', link({ values: [1, 99] }), names)).toBe('Sambar is always planned only with Idli or a deleted dish');
    expect(describeLink('Sambar', link({ target: 'base_category', values: [99] }), names)).toBe('Sambar is always planned only with a deleted category');
  });

  it('uses curry types as they are', () => {
    expect(describeLink('Raita', link({ mode: 'never', target: 'curry_category', values: ['soup'] }), names)).toBe('Raita is always kept away from soup');
  });

  it('lists the first 3 then counts the rest', () => {
    expect(describeLink('Sambar', link({ values: [1, 2, 3, 4, 5] }), names)).toBe('Sambar is always planned only with Idli, Dosa, Poori and 2 more');
    expect(describeLink('Sambar', link({ values: [1, 2, 3, 4] }), names)).toBe('Sambar is always planned only with Idli, Dosa, Poori or Rice');
  });
});

describe('shortLink', () => {
  it('is the bare names for an unscoped always link to base categories', () => {
    expect(shortLink(link({ target: 'base_category', values: [1, 2] }), names)).toBe('Rice-based, Roti-based');
  });

  it('says only with or not with, and leads with the strength word', () => {
    expect(shortLink(link({}), names)).toBe('Only with Idli, Dosa');
    expect(shortLink(link({ strength: 'usually' }), names)).toBe('Usually only with Idli, Dosa');
    expect(shortLink(link({ strength: 'moderately' }), names)).toBe('Often only with Idli, Dosa');
    expect(shortLink(link({ strength: 'sometimes', target: 'base_category', values: [1] }), names)).toBe('Sometimes only with Rice-based');
    expect(shortLink(link({ mode: 'never', target: 'extra_category', values: [1] }), names)).toBe('Not with Soup');
    expect(shortLink(link({ mode: 'never', strength: 'usually', target: 'extra_category', values: [1] }), names)).toBe('Usually not with Soup');
  });

  it('spells out a scoped base category link', () => {
    expect(shortLink(link({ target: 'base_category', values: [1], scope: { meals: ['lunch'] } }), names)).toBe('Only with Rice-based, at lunch');
    expect(shortLink(link({ mode: 'never', scope: { days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], meals: ['dinner'] } }), names)).toBe('Not with Idli, Dosa, on weekdays at dinner');
  });

  it('names deleted values', () => {
    expect(shortLink(link({ values: [99] }), names)).toBe('Only with a deleted dish');
  });
});

describe('served with', () => {
  it('reads as served with, in both forms', () => {
    expect(describeLink('Sambar', link({ mode: 'serve', values: [1] }), names)).toBe('Sambar is always served with Idli');
    expect(shortLink(link({ mode: 'serve', values: [1, 2] }), names)).toBe('Served with Idli, Dosa');
    expect(shortLink(link({ mode: 'serve', values: [1], strength: 'usually', scope: { meals: ['breakfast'] } }), names)).toBe('Usually served with Idli, at breakfast');
  });
});
