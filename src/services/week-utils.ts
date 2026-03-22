/**
 * Pure date utility functions for ISO week math.
 * All functions operate in UTC to avoid timezone-induced off-by-one errors.
 */

/**
 * Returns the ISO date string (YYYY-MM-DD) for the Monday that starts the
 * week containing the given date. Weeks start on Monday (ISO 8601).
 */
export function getISOWeekStart(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day; // Sunday goes back 6 days; others go back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Adds (or subtracts, when n < 0) n weeks to a week start ISO date string.
 * Input must be a valid YYYY-MM-DD string.
 */
export function addWeeks(weekStart: string, n: number): string {
  const d = new Date(weekStart + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns a human-readable label for the 7-day period starting on weekStart.
 * Format: "Mon D – Mon D, YYYY" where year is taken from the end of the week.
 * Example: "Mar 16 – Mar 22, 2026"
 * Cross-year example: "Dec 28 – Jan 3, 2027"
 */
export function formatWeekLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00Z');
  const end = new Date(weekStart + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(start)} \u2013 ${fmt(end)}, ${end.getUTCFullYear()}`;
}
