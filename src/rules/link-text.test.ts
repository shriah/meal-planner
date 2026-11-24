import { describe, expect, it } from 'vitest';
import { describeLink, shortLink } from './link-text';
import type { DishLink } from './owned';

// The converted parts: Base 1, Curry 2, Subzi 3, Extras 4. Base categories 1 and 2, the extra category 31, the curry type 21.
const BASE_DISH = { part: 1, kind: 'dish' } as const;
const BASE_CATEGORY = { part: 1, kind: 'category' } as const;
const EXTRA_CATEGORY = { part: 4, kind: 'category' } as const;
const PART_NAMES = { firstPart: 1, part: (id: number) => ({ 1: 'Base', 2: 'Curry', 3: 'Subzi', 4: 'Extras' } as Record<number, string>)[id] };
const names = {
  ...PART_NAMES,
  component: (id: number) => ({ 1: 'Idli', 2: 'Dosa', 3: 'Poori', 4: 'Rice', 5: 'Roti' } as Record<number, string>)[id],
  category: (id: number) => ({ 1: 'Rice-based', 2: 'Roti-based', 31: 'Soup', 21: 'soup' } as Record<number, string>)[id],
};
const link = (over: Partial<DishLink>): DishLink => ({ mode: 'with', target: BASE_DISH, values: [1, 2], strength: 'always', ...over });

describe('describeLink', () => {
  it('words each strength', () => {
    expect(describeLink('Sambar', link({ strength: 'always' }), names)).toBe('Sambar is always planned only with Idli or Dosa');
    expect(describeLink('Sambar', link({ strength: 'usually' }), names)).toBe('Sambar is usually planned only with Idli or Dosa');
    expect(describeLink('Sambar', link({ strength: 'moderately' }), names)).toBe('Sambar is often planned only with Idli or Dosa');
    expect(describeLink('Sambar', link({ strength: 'sometimes' }), names)).toBe('Sambar is sometimes planned only with Idli or Dosa');
  });

  it('words each mode', () => {
    expect(describeLink('Sambar', link({ mode: 'never', strength: 'usually' }), names)).toBe('Sambar is usually kept away from Idli or Dosa');
    expect(describeLink('Soup', link({ mode: 'never', target: EXTRA_CATEGORY, values: [31] }), names)).toBe('Soup is always kept away from Soup');
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
    expect(describeLink('Sambar', link({ target: BASE_CATEGORY, values: [99] }), names)).toBe('Sambar is always planned only with a deleted category');
  });

  it('uses curry types as they are', () => {
    expect(describeLink('Raita', link({ mode: 'never', target: { part: 2, kind: 'category' }, values: [21] }), names)).toBe('Raita is always kept away from soup');
  });

  it('lists the first 3 then counts the rest', () => {
    expect(describeLink('Sambar', link({ values: [1, 2, 3, 4, 5] }), names)).toBe('Sambar is always planned only with Idli, Dosa, Poori and 2 more');
    expect(describeLink('Sambar', link({ values: [1, 2, 3, 4] }), names)).toBe('Sambar is always planned only with Idli, Dosa, Poori or Rice');
  });
});

describe('shortLink', () => {
  it('is the bare names for an unscoped always link to base categories', () => {
    expect(shortLink(link({ target: BASE_CATEGORY, values: [1, 2] }), names)).toBe('Rice-based, Roti-based');
  });

  it('says only with or not with, and leads with the strength word', () => {
    expect(shortLink(link({}), names)).toBe('Only with Idli, Dosa');
    expect(shortLink(link({ strength: 'usually' }), names)).toBe('Usually only with Idli, Dosa');
    expect(shortLink(link({ strength: 'moderately' }), names)).toBe('Often only with Idli, Dosa');
    expect(shortLink(link({ strength: 'sometimes', target: BASE_CATEGORY, values: [1] }), names)).toBe('Sometimes only with Rice-based');
    expect(shortLink(link({ mode: 'never', target: EXTRA_CATEGORY, values: [31] }), names)).toBe('Not with Soup');
    expect(shortLink(link({ mode: 'never', strength: 'usually', target: EXTRA_CATEGORY, values: [31] }), names)).toBe('Usually not with Soup');
  });

  it('spells out a scoped base category link', () => {
    expect(shortLink(link({ target: BASE_CATEGORY, values: [1], scope: { meals: ['lunch'] } }), names)).toBe('Only with Rice-based, at lunch');
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

describe('comes with a condition', () => {
  const dishes = { ...PART_NAMES, component: (id: number) => ({ 16: 'Papad', 8: 'Sambar', 9: 'Rasam', 12: 'Beans Poriyal' } as Record<number, string>)[id] };
  const papad = (over: Partial<DishLink>) => link({ mode: 'comes', target: { part: 4, kind: 'dish' }, values: [16], ...over });

  it('words the condition', () => {
    expect(describeLink('Rice', papad({ when: { 2: [8] } }), dishes)).toBe('Rice always comes with Papad when the curry is Sambar');
    expect(describeLink('Rice', papad({ when: { 2: [8], 3: [12] } }), dishes))
      .toBe('Rice always comes with Papad when the curry is Sambar and the subzi is Beans Poriyal');
    expect(describeLink('Rice', papad({ when: { 2: [8] }, scope: { meals: ['lunch'] } }), dishes))
      .toBe('Rice always comes with Papad when the curry is Sambar, at lunch');
  });

  it('shortens the condition', () => {
    expect(shortLink(papad({ when: { 2: [8] } }), dishes)).toBe('Comes with Papad (with Sambar)');
    expect(shortLink(papad({ strength: 'usually', when: { 2: [8, 9] } }), dishes)).toBe('Usually comes with Papad (with Sambar or Rasam)');
    expect(shortLink(papad({ when: { 2: [8, 9], 3: [12] } }), dishes)).toBe('Comes with Papad (with Sambar or Rasam, and Beans Poriyal)');
  });
});

describe('comes with', () => {
  const stew = { ...PART_NAMES, component: (id: number) => ({ 11: 'Kerala Stew (Veg)', 12: 'Kerala Stew (Non-Veg)', 13: 'Rasam' } as Record<number, string>)[id] };
  it('words a comes link', () => {
    expect(describeLink('Idiyappam', link({ mode: 'comes', target: { part: 2, kind: 'dish' }, values: [11, 12] }), stew))
      .toBe('Idiyappam always comes with Kerala Stew (Veg) or Kerala Stew (Non-Veg)');
    expect(describeLink('Mutton Curry', link({ mode: 'comes', target: { part: 4, kind: 'dish' }, values: [13], strength: 'usually' }), stew))
      .toBe('Mutton Curry usually comes with Rasam');
    expect(shortLink(link({ mode: 'comes', target: { part: 4, kind: 'dish' }, values: [13] }), stew)).toBe('Comes with Rasam');
    expect(shortLink(link({ mode: 'comes', target: { part: 4, kind: 'dish' }, values: [13], strength: 'usually' }), stew)).toBe('Usually comes with Rasam');
  });
});

describe('served with a part other than the first', () => {
  it('reads as added when the dish is in the meal', () => {
    const sambar = { ...PART_NAMES, component: (id: number) => ({ 8: 'Sambar', 9: 'Rasam' } as Record<number, string>)[id] };
    const papad = link({ mode: 'serve', target: { part: 2, kind: 'dish' }, values: [8] });
    expect(describeLink('Papad', papad, sambar)).toBe('Papad is always added when Sambar is in the meal');
    expect(describeLink('Papad', { ...papad, values: [8, 9], strength: 'usually' }, sambar)).toBe('Papad is usually added when Sambar or Rasam is in the meal');
    expect(shortLink(papad, sambar)).toBe('Added with Sambar');
  });
});
