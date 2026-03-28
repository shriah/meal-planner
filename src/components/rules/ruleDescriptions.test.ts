import { describe, expect, it } from 'vitest';
import { describeRule } from './ruleDescriptions';
import type { CategoryRecord } from '@/types/category';
import type { CompiledRule } from '@/types/plan';

function rule(partial: Omit<CompiledRule, 'type'>): CompiledRule {
  return { type: 'rule', ...partial };
}

const categories: CategoryRecord[] = [
  { id: 3, kind: 'base', name: 'Millet-based', created_at: '2026-03-28T00:00:00.000Z' },
  { id: 7, kind: 'extra', name: 'Pickle', created_at: '2026-03-28T00:00:00.000Z' },
];

describe('describeRule', () => {
  it('describes non-category rules without needing category context', () => {
    expect(
      describeRule(
        rule({
          target: { mode: 'component_type', component_type: 'base' },
          scope: { days: null, slots: null },
          effects: [{ kind: 'no_repeat' }],
        }),
      ),
    ).toBe('all bases: No-repeat');
  });

  it('resolves renamed base and extra labels from category records', () => {
    expect(
      describeRule(
        rule({
          target: { mode: 'base_category', category_id: 3 },
          scope: { days: null, slots: null },
          effects: [
            { kind: 'allowed_slots', slots: ['lunch', 'dinner'] },
            { kind: 'require_extra', category_ids: [7] },
          ],
        }),
        categories,
      ),
    ).toBe('Millet-based: allowed at lunch, dinner; require Pickle extra');
  });

  it('falls back to deleted-category copy instead of raw ids', () => {
    expect(
      describeRule(
        rule({
          target: { mode: 'base_category', category_id: 99 },
          scope: { days: null, slots: null },
          effects: [{ kind: 'require_extra', category_ids: [98] }],
        }),
        categories,
      ),
    ).toBe('Deleted base category: require Deleted extra category extra');
  });
});
