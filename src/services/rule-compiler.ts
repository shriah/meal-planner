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
    case 'meal-template':
      return {
        type: 'meal-template',
        base_type: def.base_type,
        days: def.days ?? null,
        slots: def.slots ?? null,
        allowed_slots: def.allowed_slots ?? null,
        exclude_component_types: def.exclude_component_types ?? [],
        exclude_extra_categories: def.exclude_extra_categories ?? [],
        require_extra_category: def.require_extra_category ?? null,
      };
  }
}
