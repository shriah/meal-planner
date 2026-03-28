import type { RuleFormState } from '@/components/rules/types';
import type { CompiledRule, Target } from '@/types/plan';

export function compileRule(state: RuleFormState): CompiledRule {
  // Build target
  const tf = state.target;
  let target: Target;
  if (tf.mode === 'component_type') {
    target = { mode: 'component_type', component_type: tf.component_type as 'base' | 'curry' | 'subzi' };
  } else if (tf.mode === 'tag') {
    target = { mode: 'tag', filter: tf.filter };
  } else if (tf.mode === 'component') {
    target = { mode: 'component', component_id: tf.component_id! };
  } else if (tf.mode === 'base_type') {
    target = { mode: 'base_type', base_type: tf.base_type as 'rice-based' | 'bread-based' | 'other' };
  } else {
    throw new Error('compileRule called with empty target mode');
  }

  const effects: CompiledRule['effects'] = [];

  if (state.selection !== '') {
    effects.push({ kind: state.selection });
  }

  if (state.allowed_slots.length > 0) {
    effects.push({ kind: 'allowed_slots', slots: state.allowed_slots });
  }

  if (state.skip_component_types.length > 0) {
    effects.push({ kind: 'skip_component', component_types: state.skip_component_types });
  }

  if (state.require_extra_categories.length > 0) {
    effects.push({ kind: 'require_extra', categories: state.require_extra_categories });
  }

  return {
    type: 'rule',
    target,
    scope: {
      days:  state.days.length  > 0 ? state.days  : null,
      slots: state.slots.length > 0 ? state.slots : null,
    },
    effects,
  };
}

export function decompileRule(compiled: CompiledRule, name: string): RuleFormState {
  const target: RuleFormState['target'] =
    compiled.target.mode === 'component_type'
      ? { mode: 'component_type', component_type: compiled.target.component_type }
      : compiled.target.mode === 'tag'
        ? { mode: 'tag', filter: compiled.target.filter }
        : compiled.target.mode === 'component'
          ? { mode: 'component', component_id: compiled.target.component_id }
          : { mode: 'base_type', base_type: compiled.target.base_type };

  const state: RuleFormState = {
    name,
    target,
    days: compiled.scope.days ?? [],
    slots: compiled.scope.slots ?? [],
    selection: '',
    allowed_slots: [],
    skip_component_types: [],
    require_extra_categories: [],
  };

  for (const effect of compiled.effects) {
    switch (effect.kind) {
      case 'filter_pool':
      case 'require_one':
      case 'exclude':
      case 'no_repeat':
        state.selection = effect.kind;
        break;
      case 'allowed_slots':
        state.allowed_slots = effect.slots;
        break;
      case 'skip_component':
        state.skip_component_types = effect.component_types;
        break;
      case 'require_extra':
        state.require_extra_categories = effect.categories;
        break;
    }
  }

  return state;
}
