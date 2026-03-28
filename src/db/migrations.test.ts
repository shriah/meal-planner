import { describe, it, expect } from 'vitest';
import { migrateToCompiledRule, stripLegacyExcludeExtra } from './client';

describe('migrateToCompiledRule', () => {
  it('migrates no-repeat to component_type target + no_repeat effect', () => {
    const input = { type: 'no-repeat', component_type: 'base', within: 'week' };
    expect(migrateToCompiledRule(input)).toEqual({
      type: 'rule',
      target: { mode: 'component_type', component_type: 'base' },
      scope: { days: null, slots: null },
      effects: [{ kind: 'no_repeat' }],
    });
  });

  it('migrates scheduling-rule filter-pool with tag match', () => {
    const input = {
      type: 'scheduling-rule',
      effect: 'filter-pool',
      days: ['friday'],
      slots: null,
      match: { mode: 'tag', filter: { protein_tag: 'fish' } },
    };
    expect(migrateToCompiledRule(input)).toEqual({
      type: 'rule',
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      scope: { days: ['friday'], slots: null },
      effects: [{ kind: 'filter_pool' }],
    });
  });

  it('migrates scheduling-rule require-one with component match', () => {
    const input = {
      type: 'scheduling-rule',
      effect: 'require-one',
      days: ['saturday', 'sunday'],
      slots: ['lunch'],
      match: { mode: 'component', component_id: 42 },
    };
    expect(migrateToCompiledRule(input)).toEqual({
      type: 'rule',
      target: { mode: 'component', component_id: 42 },
      scope: { days: ['saturday', 'sunday'], slots: ['lunch'] },
      effects: [{ kind: 'require_one' }],
    });
  });

  it('migrates scheduling-rule exclude with tag match', () => {
    const input = {
      type: 'scheduling-rule',
      effect: 'exclude',
      days: null,
      slots: null,
      match: { mode: 'tag', filter: { dietary_tag: 'non-veg' } },
    };
    expect(migrateToCompiledRule(input)).toEqual({
      type: 'rule',
      target: { mode: 'tag', filter: { dietary_tag: 'non-veg' } },
      scope: { days: null, slots: null },
      effects: [{ kind: 'exclude' }],
    });
  });

  it('migrates meal-template base selector with composition effects', () => {
    const input = {
      type: 'meal-template',
      selector: { mode: 'base', base_type: 'rice-based' },
      days: null,
      slots: null,
      allowed_slots: ['lunch', 'dinner'],
      exclude_component_types: ['curry'],
      exclude_extra_categories: ['sweet'],
      require_extra_category: 'condiment',
    };
    expect(migrateToCompiledRule(input)).toEqual({
      type: 'rule',
      target: { mode: 'base_type', base_type: 'rice-based' },
      scope: { days: null, slots: null },
      effects: [
        { kind: 'allowed_slots', slots: ['lunch', 'dinner'] },
        { kind: 'skip_component', component_types: ['curry'] },
        { kind: 'require_extra', categories: ['condiment'] },
      ],
    });
  });

  it('migrates meal-template with null allowed_slots (no placement effect)', () => {
    const input = {
      type: 'meal-template',
      selector: { mode: 'base', base_type: 'bread-based' },
      days: null,
      slots: null,
      allowed_slots: null,
      exclude_component_types: [],
      exclude_extra_categories: ['sweet'],
      require_extra_category: null,
    };
    const result = migrateToCompiledRule(input) as { effects: unknown[] };
    expect(result.effects).toEqual([]);
  });

  it('migrates meal-template tag selector', () => {
    const input = {
      type: 'meal-template',
      selector: { mode: 'tag', filter: { regional_tag: 'south-indian' } },
      days: null,
      slots: null,
      allowed_slots: null,
      exclude_component_types: ['subzi'],
      exclude_extra_categories: [],
      require_extra_category: null,
    };
    expect(migrateToCompiledRule(input)).toEqual({
      type: 'rule',
      target: { mode: 'tag', filter: { regional_tag: 'south-indian' } },
      scope: { days: null, slots: null },
      effects: [{ kind: 'skip_component', component_types: ['subzi'] }],
    });
  });

  it('passes through already-migrated CompiledRule unchanged', () => {
    const rule = {
      type: 'rule',
      target: { mode: 'component_type', component_type: 'base' },
      scope: { days: null, slots: null },
      effects: [{ kind: 'no_repeat' }],
    };
    expect(migrateToCompiledRule(rule)).toEqual(rule);
  });

  it('passes through unknown types unchanged', () => {
    const unknown = { type: 'unknown-type', data: 'preserved' };
    expect(migrateToCompiledRule(unknown)).toEqual(unknown);
  });
});

describe('stripLegacyExcludeExtra', () => {
  it('removes exclude_extra effects from already-compiled rules', () => {
    expect(
      stripLegacyExcludeExtra({
        type: 'rule',
        target: { mode: 'base_type', base_type: 'rice-based' },
        scope: { days: null, slots: null },
        effects: [
          { kind: 'allowed_slots', slots: ['lunch'] },
          { kind: 'exclude_extra', categories: ['sweet'] },
          { kind: 'require_extra', categories: ['condiment'] },
        ],
      }),
    ).toEqual({
      type: 'rule',
      target: { mode: 'base_type', base_type: 'rice-based' },
      scope: { days: null, slots: null },
      effects: [
        { kind: 'allowed_slots', slots: ['lunch'] },
        { kind: 'require_extra', categories: ['condiment'] },
      ],
    });
  });

  it('passes through unrelated shapes unchanged', () => {
    const unknown = { type: 'unknown-type', data: 'preserved' };
    expect(stripLegacyExcludeExtra(unknown)).toEqual(unknown);
  });
});
