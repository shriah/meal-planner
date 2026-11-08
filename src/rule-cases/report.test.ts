import { describe, expect, it } from 'vitest';
import { DAYS, MEALS } from '@/planner';
import { TEST_LIBRARY } from './library';
import { renderReport } from './report';
import type { CaseResult } from './types';

const week = () =>
  DAYS.flatMap((day) => MEALS.map((meal_slot) => ({
    slot: { day, meal_slot, extra_ids: [] as number[] },
    text: 'Pongal',
    highlight: day === 'monday' && meal_slot === 'breakfast',
  })));

const result = (over: Partial<CaseResult> = {}): CaseResult => ({
  id: 'a', group: 'Pairings', name: 'Case A', why: 'because', kind: 'plan', status: 'pass', defaults: true,
  dishes: [{ name: 'Pongal', type: 'base' }], rules: ['Sambar is always served with Pongal'],
  expectations: [{ says: 'Pongal planned', pass: true, got: '8' }],
  sampleWeek: week() as CaseResult['sampleWeek'],
  ...over,
});

const RUN_AT = new Date('2026-11-08T10:42:00Z');

describe('renderReport', () => {
  it('shows names, counts and the dishes library', () => {
    const html = renderReport(
      [result(), result({ id: 'b', name: 'Case B', status: 'fail' }), result({ id: 'c', name: 'Case C', status: 'known', known: 'x' })],
      TEST_LIBRARY, RUN_AT,
    );
    for (const n of ['Case A', 'Case B', 'Case C', 'Dishes library']) expect(html).toContain(n);
    expect(html).toContain('1 passed');
    expect(html).toContain('1 failed');
    expect(html).toContain('1 known');
    expect(html).toContain('Coconut Chutney');
  });

  it('selects the first failing case, else the first', () => {
    const html = renderReport([result(), result({ id: 'b', name: 'Case B', status: 'fail' })], TEST_LIBRARY, RUN_AT);
    expect(html).toMatch(/<section class="panel" id="p-b">/);
    expect(html).toMatch(/<section class="panel hidden" id="p-a">/);
    const none = renderReport([result(), result({ id: 'b', name: 'Case B' })], TEST_LIBRARY, RUN_AT);
    expect(none).toMatch(/<section class="panel" id="p-a">/);
  });

  it('escapes dish names', () => {
    const html = renderReport([result({ dishes: [{ name: 'Dal <b>&', type: 'curry' }] })], TEST_LIBRARY, RUN_AT);
    expect(html).toContain('Dal &lt;b&gt;&amp;');
    expect(html).not.toContain('Dal <b>&');
  });

  it('loads nothing external', () => {
    const html = renderReport([result()], TEST_LIBRARY, RUN_AT);
    expect(html).not.toContain('<script src');
    expect(html).not.toContain('<link');
  });

  it('shows a known issue and the default rules line', () => {
    const html = renderReport([result({ status: 'known', known: 'Pairing is dropped' })], TEST_LIBRARY, RUN_AT);
    expect(html).toContain('Known issue');
    expect(html).toContain('Pairing is dropped');
    expect(html).toContain('+ default rules');
    expect(renderReport([result({ defaults: false })], TEST_LIBRARY, RUN_AT)).not.toContain('+ default rules');
  });
});
