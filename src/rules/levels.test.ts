import { describe, expect, it } from 'vitest';
import { LEVELS, nearestLevel, STRENGTH_COST, STRENGTH_WORDS } from './levels';

describe('strength words', () => {
  it('has one label and one lowercase word per strength', () => {
    expect(STRENGTH_WORDS).toEqual({
      always: { label: 'Always', word: 'always' },
      usually: { label: 'Usually', word: 'usually' },
      moderately: { label: 'Often', word: 'often' },
      sometimes: { label: 'Sometimes', word: 'sometimes' },
    });
  });

  it('writes 10, 6 and 3 for the soft strengths', () => {
    expect(STRENGTH_COST).toEqual({ usually: 10, moderately: 6, sometimes: 3 });
  });
});

describe('weight levels', () => {
  it('has three named levels, from weakest to strongest', () => {
    expect(LEVELS.map((l) => l.label)).toEqual(['Slightly', 'Moderately', 'Strongly']);
  });

  it('shows a stored weight as the nearest level', () => {
    expect(nearestLevel(1).label).toBe('Slightly');
    expect(nearestLevel(2).label).toBe('Moderately');
    expect(nearestLevel(5).label).toBe('Strongly');
    expect(nearestLevel(10).label).toBe('Strongly');
  });
});
