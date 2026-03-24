import type { RuleDefinition, CompiledFilter } from '@/types/plan';

export function compileRule(def: RuleDefinition): CompiledFilter {
  switch (def.ruleType) {
    case 'no-repeat':
      return {
        type: 'no-repeat',
        component_type: def.component_type,
        within: 'week',
      };
    case 'scheduling-rule':
      return {
        type: 'scheduling-rule',
        effect: def.effect,
        days: def.days ?? null,
        slots: def.slots ?? null,
        match: def.match,
      };
  }
}
