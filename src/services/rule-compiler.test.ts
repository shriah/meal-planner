import { describe, it, expect } from 'vitest';
import { compileRule } from './rule-compiler';
import { CompiledFilterSchema } from '@/types/plan';

describe('RULE-02: compileRule', () => {
  describe('day-filter rules', () => {
    it('compiles a day-filter with no slot restriction (slots = null)', () => {
      const result = compileRule({ ruleType: 'day-filter', days: ['friday'], filter: { protein_tag: 'fish' } });
      expect(result).toEqual({ type: 'day-filter', days: ['friday'], slots: null, filter: { protein_tag: 'fish' } });
    });

    it('compiles a day-filter with specific slot', () => {
      const result = compileRule({ ruleType: 'day-filter', days: ['monday'], slots: ['breakfast'], filter: { dietary_tag: 'veg' } });
      expect(result).toEqual({ type: 'day-filter', days: ['monday'], slots: ['breakfast'], filter: { dietary_tag: 'veg' } });
    });

    it('compiles a day-filter with multiple days and multiple tags', () => {
      const result = compileRule({ ruleType: 'day-filter', days: ['saturday', 'sunday'], filter: { dietary_tag: 'veg', regional_tag: 'south-indian' } });
      expect(result.type).toBe('day-filter');
      expect(result).toHaveProperty('days', ['saturday', 'sunday']);
    });
  });

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

  describe('require-component rules', () => {
    it('compiles require-component with no slot restriction', () => {
      const result = compileRule({ ruleType: 'require-component', component_id: 42, days: ['saturday', 'sunday'] });
      expect(result).toEqual({ type: 'require-component', component_id: 42, days: ['saturday', 'sunday'], slots: null });
    });

    it('compiles require-component with specific slot', () => {
      const result = compileRule({ ruleType: 'require-component', component_id: 7, days: ['wednesday'], slots: ['dinner'] });
      expect(result).toEqual({ type: 'require-component', component_id: 7, days: ['wednesday'], slots: ['dinner'] });
    });
  });

  describe('Zod validation round-trip', () => {
    it('every compiled output passes CompiledFilterSchema.parse()', () => {
      const defs = [
        { ruleType: 'day-filter' as const, days: ['friday' as const], filter: { protein_tag: 'fish' as const } },
        { ruleType: 'no-repeat' as const, component_type: 'subzi' as const },
        { ruleType: 'require-component' as const, component_id: 1, days: ['monday' as const] },
      ];
      for (const def of defs) {
        const compiled = compileRule(def);
        expect(() => CompiledFilterSchema.parse(compiled)).not.toThrow();
      }
    });
  });
});
