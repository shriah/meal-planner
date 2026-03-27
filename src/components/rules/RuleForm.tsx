'use client';

import * as React from 'react';
import { useReducer, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { compileRule } from '@/services/rule-compiler';
import { addRule } from '@/services/food-db';
import { RuleFields } from './RuleFormFields/RuleFields';
import { RuleImpactPreview } from './RuleImpactPreview';
import type { RuleFormState, FormAction } from './types';

// ─── Example presets ──────────────────────────────────────────────────────────

const EXAMPLE_PRESETS: Record<string, RuleFormState> = {
  'fish-fridays': {
    name: 'Fish Fridays',
    target: { mode: 'tag', filter: { protein_tag: 'fish' } },
    days: ['friday'], slots: [],
    selection: 'require_one',
    allowed_slots: [], skip_component_types: [],
    exclude_extra_categories: [], require_extra_categories: [],
  },
  'no-repeat-subzi': {
    name: 'No repeat subzi',
    target: { mode: 'component_type', component_type: 'subzi' },
    days: [], slots: [],
    selection: 'no_repeat',
    allowed_slots: [], skip_component_types: [],
    exclude_extra_categories: [], require_extra_categories: [],
  },
  'weekend-special': {
    name: 'Weekend special',
    target: { mode: 'tag', filter: { occasion_tag: 'weekend' } },
    days: ['saturday', 'sunday'], slots: [],
    selection: 'filter_pool',
    allowed_slots: [], skip_component_types: [],
    exclude_extra_categories: [], require_extra_categories: [],
  },
  'no-paneer-weekdays': {
    name: 'No paneer weekdays',
    target: { mode: 'tag', filter: { protein_tag: 'paneer' } },
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], slots: [],
    selection: 'exclude',
    allowed_slots: [], skip_component_types: [],
    exclude_extra_categories: [], require_extra_categories: [],
  },
  'rice-lunch-dinner': {
    name: 'Rice: lunch and dinner only',
    target: { mode: 'base_type', base_type: 'rice-based' },
    days: [], slots: [],
    selection: '',
    allowed_slots: ['lunch', 'dinner'],
    skip_component_types: [], exclude_extra_categories: [], require_extra_categories: [],
  },
};

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: RuleFormState = {
  name: '',
  target: { mode: '' },
  days: [], slots: [],
  selection: '',
  allowed_slots: [], skip_component_types: [],
  exclude_extra_categories: [], require_extra_categories: [],
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

function formReducer(state: RuleFormState, action: FormAction): RuleFormState {
  switch (action.type) {
    case 'SET_NAME':
      return { ...state, name: action.name };

    case 'SET_TARGET_MODE': {
      const mode = action.mode;
      const base: Omit<RuleFormState, 'target'> = {
        name: state.name, days: state.days, slots: state.slots,
        selection: state.selection, allowed_slots: state.allowed_slots,
        skip_component_types: state.skip_component_types,
        exclude_extra_categories: state.exclude_extra_categories,
        require_extra_categories: state.require_extra_categories,
      };
      if (mode === 'component_type') return { ...base, target: { mode, component_type: '' } };
      if (mode === 'tag')            return { ...base, target: { mode, filter: {} } };
      if (mode === 'component')      return { ...base, target: { mode, component_id: null } };
      if (mode === 'base_type')      return { ...base, target: { mode, base_type: '' } };
      return state;
    }

    case 'SET_TARGET_COMPONENT_TYPE':
      if (state.target.mode === 'component_type')
        return { ...state, target: { mode: 'component_type', component_type: action.component_type } };
      return state;

    case 'SET_TARGET_TAG_FILTER':
      if (state.target.mode === 'tag')
        return { ...state, target: { mode: 'tag', filter: action.filter } };
      return state;

    case 'SET_TARGET_COMPONENT_ID':
      if (state.target.mode === 'component')
        return { ...state, target: { mode: 'component', component_id: action.component_id } };
      return state;

    case 'SET_TARGET_BASE_TYPE':
      if (state.target.mode === 'base_type')
        return { ...state, target: { mode: 'base_type', base_type: action.base_type } };
      return state;

    case 'SET_DAYS':   return { ...state, days: action.days };
    case 'SET_SLOTS':  return { ...state, slots: action.slots };
    case 'SET_SELECTION': return { ...state, selection: action.selection };
    case 'SET_ALLOWED_SLOTS': return { ...state, allowed_slots: action.allowed_slots };
    case 'SET_SKIP_COMPONENT_TYPES': return { ...state, skip_component_types: action.skip_component_types };
    case 'SET_EXCLUDE_EXTRA_CATEGORIES': return { ...state, exclude_extra_categories: action.categories };
    case 'SET_REQUIRE_EXTRA_CATEGORIES': return { ...state, require_extra_categories: action.categories };
    case 'LOAD_PRESET': return action.state;

    default: return state;
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isFormValid(state: RuleFormState): boolean {
  if (state.name.trim() === '') return false;
  const t = state.target;
  if (t.mode === '') return false;
  if (t.mode === 'component_type' && t.component_type === '') return false;
  if (t.mode === 'tag' && !Object.values(t.filter).some(v => v !== undefined)) return false;
  if (t.mode === 'component' && t.component_id === null) return false;
  if (t.mode === 'base_type' && t.base_type === '') return false;
  // At least one effect
  return (
    state.selection !== '' ||
    state.allowed_slots.length > 0 ||
    state.skip_component_types.length > 0 ||
    state.exclude_extra_categories.length > 0 ||
    state.require_extra_categories.length > 0
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RuleForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(formReducer, initialState);
  const [saving, setSaving] = useState(false);
  const presetLoadedRef = useRef(false);

  useEffect(() => {
    if (presetLoadedRef.current) return;
    const preset = searchParams.get('preset');
    if (preset && EXAMPLE_PRESETS[preset]) {
      dispatch({ type: 'LOAD_PRESET', state: EXAMPLE_PRESETS[preset] });
      presetLoadedRef.current = true;
    }
  }, [searchParams]);

  const handleSave = async () => {
    if (!isFormValid(state) || saving) return;
    setSaving(true);
    try {
      const compiled = compileRule(state);
      await addRule({
        name: state.name.trim(),
        enabled: true,
        compiled_filter: compiled,
        created_at: new Date().toISOString(),
      });
      router.push('/rules');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="px-4 py-8 sm:px-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/rules"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-[28px] font-semibold font-heading">New Rule</h1>
      </div>

      <form onSubmit={e => { e.preventDefault(); handleSave(); }} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="rule-name">Rule name</Label>
          <Input
            id="rule-name"
            placeholder="e.g. Fish Fridays"
            value={state.name}
            onChange={e => dispatch({ type: 'SET_NAME', name: e.target.value })}
          />
        </div>

        <RuleFields state={state} dispatch={dispatch} />

        {state.target.mode !== '' && <RuleImpactPreview formState={state} />}

        <Button type="submit" disabled={!isFormValid(state) || saving}>
          {saving ? 'Saving...' : 'Save Rule'}
        </Button>
      </form>
    </main>
  );
}
