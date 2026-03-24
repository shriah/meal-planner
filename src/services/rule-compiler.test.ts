import { describe, it, expect } from 'vitest';
import { compileRule } from './rule-compiler';
import { CompiledFilterSchema } from '@/types/plan';

describe('RULE-02: compileRule', () => {
  describe('no-repeat rules', () => {
    it('compiles no-repeat for subzi', () => {
      const result = compileRule({ ruleType: 'no-repeat', component_type: 'subzi' });
      expect(result).toEqual({ type: 'no-repeat', component_type: 'subzi', within: 'week' });
    });

    it('compiles no-repeat for curry', () => {
      const result = compileRule({ ruleType: 'no-repeat', component_type: 'curry' });
      expect(result).toEqual({ type: 'no-repeat', component_type: 'curry', within: 'week' });
    });

    it('compiles no-repeat for base', () => {
      const result = compileRule({ ruleType: 'no-repeat', component_type: 'base' });
      expect(result).toEqual({ type: 'no-repeat', component_type: 'base', within: 'week' });
    });
  });

  describe('scheduling-rule rules', () => {
    it('compiles filter-pool with tag match and no slots (slots = null)', () => {
      const result = compileRule({
        ruleType: 'scheduling-rule',
        effect: 'filter-pool',
        days: ['friday'],
        match: { mode: 'tag', filter: { protein_tag: 'fish' } },
      });
      expect(result).toEqual({
        type: 'scheduling-rule',
        effect: 'filter-pool',
        days: ['friday'],
        slots: null,
        match: { mode: 'tag', filter: { protein_tag: 'fish' } },
      });
    });

    it('compiles require-one with component match and no days (days = null)', () => {
      const result = compileRule({
        ruleType: 'scheduling-rule',
        effect: 'require-one',
        match: { mode: 'component', component_id: 42 },
      });
      expect(result).toEqual({
        type: 'scheduling-rule',
        effect: 'require-one',
        days: null,
        slots: null,
        match: { mode: 'component', component_id: 42 },
      });
    });

    it('compiles exclude with both days and slots specified', () => {
      const result = compileRule({
        ruleType: 'scheduling-rule',
        effect: 'exclude',
        days: ['monday'],
        slots: ['breakfast', 'lunch'],
        match: { mode: 'tag', filter: { dietary_tag: 'non-veg' } },
      });
      expect(result).toEqual({
        type: 'scheduling-rule',
        effect: 'exclude',
        days: ['monday'],
        slots: ['breakfast', 'lunch'],
        match: { mode: 'tag', filter: { dietary_tag: 'non-veg' } },
      });
    });

    it('converts undefined days and slots to null', () => {
      const result = compileRule({
        ruleType: 'scheduling-rule',
        effect: 'filter-pool',
        match: { mode: 'tag', filter: {} },
      });
      expect(result).toMatchObject({ type: 'scheduling-rule', days: null, slots: null });
    });
  });

  describe('Zod validation round-trip', () => {
    it('every compiled output passes CompiledFilterSchema.parse()', () => {
      const defs = [
        { ruleType: 'no-repeat' as const, component_type: 'subzi' as const },
        { ruleType: 'scheduling-rule' as const, effect: 'filter-pool' as const, days: ['friday' as const], match: { mode: 'tag' as const, filter: { protein_tag: 'fish' as const } } },
      ];
      for (const def of defs) {
        const compiled = compileRule(def);
        expect(() => CompiledFilterSchema.parse(compiled)).not.toThrow();
      }
    });
  });

  describe('scheduling-rule Zod schema', () => {
    it('accepts scheduling-rule with filter-pool effect and tag match', () => {
      expect(() => CompiledFilterSchema.parse({
        type: 'scheduling-rule',
        effect: 'filter-pool',
        days: ['friday'],
        slots: ['lunch'],
        match: { mode: 'tag', filter: { protein_tag: 'fish' } },
      })).not.toThrow();
    });

    it('accepts scheduling-rule with require-one effect and component match', () => {
      expect(() => CompiledFilterSchema.parse({
        type: 'scheduling-rule',
        effect: 'require-one',
        days: null,
        slots: null,
        match: { mode: 'component', component_id: 42 },
      })).not.toThrow();
    });

    it('accepts scheduling-rule with exclude effect and multiple days/slots', () => {
      expect(() => CompiledFilterSchema.parse({
        type: 'scheduling-rule',
        effect: 'exclude',
        days: ['monday', 'tuesday'],
        slots: ['breakfast', 'dinner'],
        match: { mode: 'tag', filter: { dietary_tag: 'non-veg' } },
      })).not.toThrow();
    });

    it('rejects scheduling-rule with invalid effect', () => {
      expect(() => CompiledFilterSchema.parse({
        type: 'scheduling-rule',
        effect: 'invalid',
        days: ['friday'],
        slots: null,
        match: { mode: 'tag', filter: {} },
      })).toThrow();
    });

    it('rejects scheduling-rule with unknown match mode', () => {
      expect(() => CompiledFilterSchema.parse({
        type: 'scheduling-rule',
        effect: 'filter-pool',
        days: ['friday'],
        slots: ['lunch'],
        match: { mode: 'unknown' },
      })).toThrow();
    });
  });
});
