import type { LinkStrength } from './owned';

/** The one set of words for how firmly a link or soft rule holds: the link editor, link text, the assistant and the Rules page's cost select. */
export const STRENGTH_WORDS: Record<LinkStrength, { label: string; word: string }> = {
  always: { label: 'Always', word: 'always' },
  usually: { label: 'Usually', word: 'usually' },
  moderately: { label: 'Often', word: 'often' },
  sometimes: { label: 'Sometimes', word: 'sometimes' },
};

/** The soft cost each non-hard strength writes. */
export const STRENGTH_COST = { usually: 10, moderately: 6, sometimes: 3 } as const;

// Weights of a prefer or avoid rule: a nudge, not a "how often". Stored numbers are unchanged;
// the editor shows the nearest level and writes that level's number when the user picks one.
export const LEVELS = [
  { label: 'Slightly', weight: 1 },
  { label: 'Moderately', weight: 2 },
  { label: 'Strongly', weight: 4 },
] as const;

export type Level = (typeof LEVELS)[number];

/** The level closest to a stored weight. Ties go to the weaker level. */
export function nearestLevel(weight: number): Level {
  return LEVELS.reduce((best, level) =>
    Math.abs(level.weight - weight) < Math.abs(best.weight - weight) ? level : best,
  );
}
