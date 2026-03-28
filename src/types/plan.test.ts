import { describe, it, expect } from 'vitest';
import { CompiledRuleSchema } from './plan';

describe('CompiledRuleSchema', () => {
  it('validates a no-repeat rule', () => {
    const rule = {
      type: 'rule',
      target: { mode: 'component_type', component_type: 'base' },
      scope: { days: null, slots: null },
      effects: [{ kind: 'no_repeat' }],
    };
    expect(CompiledRuleSchema.safeParse(rule).success).toBe(true);
  });

  it('validates a filter_pool rule with tag target', () => {
    const rule = {
      type: 'rule',
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      scope: { days: ['friday'], slots: null },
      effects: [{ kind: 'filter_pool' }],
    };
    expect(CompiledRuleSchema.safeParse(rule).success).toBe(true);
  });

  it('validates a rice template rule with composition effects', () => {
    const rule = {
      type: 'rule',
      target: { mode: 'base_category', category_id: 3 },
      scope: { days: null, slots: null },
      effects: [
        { kind: 'allowed_slots', slots: ['lunch', 'dinner'] },
        { kind: 'skip_component', component_types: ['curry'] },
        { kind: 'require_extra', category_ids: [7] },
      ],
    };
    expect(CompiledRuleSchema.safeParse(rule).success).toBe(true);
  });

  it('rejects unknown effect kind', () => {
    const rule = {
      type: 'rule',
      target: { mode: 'component_type', component_type: 'base' },
      scope: { days: null, slots: null },
      effects: [{ kind: 'unknown_effect' }],
    };
    expect(CompiledRuleSchema.safeParse(rule).success).toBe(false);
  });
});
