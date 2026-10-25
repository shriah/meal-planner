import { describe, expect, it } from 'vitest';
import { LEVELS, nearestLevel } from './levels';

describe('strength levels', () => {
  it('has three named levels, from weakest to strongest', () => {
    expect(LEVELS.map((l) => l.label)).toEqual(['Slightly', 'Moderately', 'Strongly']);
  });

  it('shows a stored cost as the nearest level, without changing it', () => {
    expect(nearestLevel('cost', 2).label).toBe('Slightly');
    expect(nearestLevel('cost', 3).label).toBe('Slightly');
    expect(nearestLevel('cost', 5).label).toBe('Moderately');
    expect(nearestLevel('cost', 10).label).toBe('Strongly');
    expect(nearestLevel('cost', 1).label).toBe('Slightly');
  });

  it('shows a stored weight as the nearest level', () => {
    expect(nearestLevel('weight', 1).label).toBe('Slightly');
    expect(nearestLevel('weight', 2).label).toBe('Moderately');
    expect(nearestLevel('weight', 5).label).toBe('Strongly');
    expect(nearestLevel('weight', 10).label).toBe('Strongly');
  });
});
