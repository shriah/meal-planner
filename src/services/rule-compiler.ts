import type { RuleDefinition, CompiledFilter } from '@/types/plan';

export function compileRule(def: RuleDefinition): CompiledFilter {
  switch (def.ruleType) {
    case 'day-filter':
      return {
        type: 'day-filter',
        days: def.days,
        slots: def.slots ?? null,
        filter: def.filter,
      };
    case 'no-repeat':
      return {
        type: 'no-repeat',
        component_type: def.component_type,
        within: 'week',
      };
    case 'require-component':
      return {
        type: 'require-component',
        component_id: def.component_id,
        days: def.days,
        slots: def.slots ?? null,
      };
  }
}
