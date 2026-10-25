// Named strengths for soft rules. Stored numbers are unchanged (a cost of 1–10, a weight of 1–10);
// the editor shows the nearest level and writes that level's number when the user picks one.
export const LEVELS = [
  { label: 'Slightly', cost: 3, weight: 1 },
  { label: 'Moderately', cost: 6, weight: 2 },
  { label: 'Strongly', cost: 10, weight: 4 },
] as const;

export type Level = (typeof LEVELS)[number];

/** The level closest to a stored cost or weight. Ties go to the weaker level. */
export function nearestLevel(kind: 'cost' | 'weight', value: number): Level {
  return LEVELS.reduce((best, level) =>
    Math.abs(level[kind] - value) < Math.abs(best[kind] - value) ? level : best,
  );
}
