import { describe, it, expect } from 'vitest';
import { getISOWeekStart, addWeeks, formatWeekLabel } from '@/services/week-utils';

// ─── getISOWeekStart ──────────────────────────────────────────────────────────

describe('getISOWeekStart', () => {
  it('Sunday maps to the previous Monday', () => {
    // 2026-03-22 is a Sunday
    expect(getISOWeekStart(new Date('2026-03-22T00:00:00Z'))).toBe('2026-03-16');
  });

  it('Monday stays as the same Monday', () => {
    // 2026-03-23 is a Monday
    expect(getISOWeekStart(new Date('2026-03-23T00:00:00Z'))).toBe('2026-03-23');
  });

  it('Wednesday maps to the Monday of that week', () => {
    // 2026-03-25 is a Wednesday
    expect(getISOWeekStart(new Date('2026-03-25T00:00:00Z'))).toBe('2026-03-23');
  });

  it('Saturday maps to the Monday of that week', () => {
    // 2026-03-28 is a Saturday
    expect(getISOWeekStart(new Date('2026-03-28T00:00:00Z'))).toBe('2026-03-23');
  });

  it('January 1 edge case — wraps to December of previous year if Jan 1 is not Monday', () => {
    // 2026-01-01 is a Thursday → maps to 2025-12-29 (Monday)
    expect(getISOWeekStart(new Date('2026-01-01T00:00:00Z'))).toBe('2025-12-29');
  });

  it('Friday maps to the Monday of that week', () => {
    // 2026-03-27 is a Friday
    expect(getISOWeekStart(new Date('2026-03-27T00:00:00Z'))).toBe('2026-03-23');
  });
});

// ─── addWeeks ─────────────────────────────────────────────────────────────────

describe('addWeeks', () => {
  it('adds 1 week', () => {
    expect(addWeeks('2026-03-16', 1)).toBe('2026-03-23');
  });

  it('subtracts 1 week', () => {
    expect(addWeeks('2026-03-16', -1)).toBe('2026-03-09');
  });

  it('adds 0 weeks returns same date', () => {
    expect(addWeeks('2026-03-16', 0)).toBe('2026-03-16');
  });

  it('adds 4 weeks crossing a month boundary', () => {
    expect(addWeeks('2026-03-16', 4)).toBe('2026-04-13');
  });

  it('subtracts enough weeks to cross a year boundary', () => {
    expect(addWeeks('2026-01-05', -1)).toBe('2025-12-29');
  });
});

// ─── formatWeekLabel ──────────────────────────────────────────────────────────

describe('formatWeekLabel', () => {
  it('formats a mid-month week', () => {
    const label = formatWeekLabel('2026-03-16');
    expect(label).toContain('Mar 16');
    expect(label).toContain('Mar 22');
    expect(label).toContain('2026');
  });

  it('formats a week that spans two months', () => {
    // 2026-03-30 (Mon) to 2026-04-05 (Sun)
    const label = formatWeekLabel('2026-03-30');
    expect(label).toContain('Mar 30');
    expect(label).toContain('Apr 5');
    expect(label).toContain('2026');
  });

  it('formats a week that spans two years (Dec 28 – Jan 3)', () => {
    // 2026-12-28 (Mon) to 2027-01-03 (Sun)
    const label = formatWeekLabel('2026-12-28');
    expect(label).toContain('Dec 28');
    expect(label).toContain('Jan 3');
    expect(label).toContain('2027');
  });
});
