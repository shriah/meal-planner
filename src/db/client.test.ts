import { describe, it, expect } from 'vitest';
import { migrateCompiledFilter } from '@/db/client';

describe('migrateCompiledFilter', () => {
  it('converts day-filter to scheduling-rule with filter-pool effect', () => {
    const input = {
      type: 'day-filter',
      days: ['friday'],
      slots: null,
      filter: { protein_tag: 'fish' },
    };
    const result = migrateCompiledFilter(input);
    expect(result).toEqual({
      type: 'scheduling-rule',
      effect: 'filter-pool',
      days: ['friday'],
      slots: null,
      match: { mode: 'tag', filter: { protein_tag: 'fish' } },
    });
  });

  it('converts day-filter with slots to scheduling-rule preserving slots', () => {
    const input = {
      type: 'day-filter',
      days: ['monday', 'wednesday'],
      slots: ['breakfast'],
      filter: { dietary_tag: 'veg' },
    };
    const result = migrateCompiledFilter(input);
    expect(result).toEqual({
      type: 'scheduling-rule',
      effect: 'filter-pool',
      days: ['monday', 'wednesday'],
      slots: ['breakfast'],
      match: { mode: 'tag', filter: { dietary_tag: 'veg' } },
    });
  });

  it('converts day-filter with undefined slots to null', () => {
    const input = {
      type: 'day-filter',
      days: ['friday'],
      slots: undefined,
      filter: { protein_tag: 'fish' },
    };
    const result = migrateCompiledFilter(input);
    expect(result).toHaveProperty('slots', null);
  });

  it('converts require-component to scheduling-rule with require-one effect', () => {
    const input = {
      type: 'require-component',
      component_id: 42,
      days: ['monday'],
      slots: null,
    };
    const result = migrateCompiledFilter(input);
    expect(result).toEqual({
      type: 'scheduling-rule',
      effect: 'require-one',
      days: ['monday'],
      slots: null,
      match: { mode: 'component', component_id: 42 },
    });
  });

  it('converts require-component with undefined slots to null', () => {
    const input = {
      type: 'require-component',
      component_id: 7,
      days: ['tuesday'],
      slots: undefined,
    };
    const result = migrateCompiledFilter(input);
    expect(result).toHaveProperty('slots', null);
  });

  it('passes through scheduling-rule records unchanged', () => {
    const input = {
      type: 'scheduling-rule',
      effect: 'exclude',
      days: ['friday'],
      slots: null,
      match: { mode: 'tag', filter: { protein_tag: 'paneer' } },
    };
    const result = migrateCompiledFilter(input);
    expect(result).toBe(input); // Same reference — not cloned
  });

  it('passes through no-repeat records unchanged', () => {
    const input = {
      type: 'no-repeat',
      component_type: 'base',
      within: 'week',
    };
    const result = migrateCompiledFilter(input);
    expect(result).toBe(input);
  });

  it('passes through null/undefined/non-object values unchanged', () => {
    expect(migrateCompiledFilter(null)).toBeNull();
    expect(migrateCompiledFilter(undefined)).toBeUndefined();
    expect(migrateCompiledFilter('string')).toBe('string');
  });
});
