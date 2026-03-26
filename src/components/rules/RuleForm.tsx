'use client';

import * as React from 'react';
import { useReducer, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { compileRule } from '@/services/rule-compiler';
import { addRule } from '@/services/food-db';
import { NoRepeatFields } from './RuleFormFields/NoRepeatFields';
import { SchedulingRuleFields } from './RuleFormFields/SchedulingRuleFields';
import { MealTemplateFields } from './RuleFormFields/MealTemplateFields';
import { RuleImpactPreview } from './RuleImpactPreview';
import type { FormState, FormAction, MealTemplateFormState } from './types';

// ─── Example presets ──────────────────────────────────────────────────────────

const EXAMPLE_PRESETS: Record<string, FormState> = {
  'fish-fridays': {
    name: 'Fish Fridays',
    ruleType: 'scheduling-rule',
    effect: 'require-one',
    days: ['friday'],
    slots: [],
    match: { mode: 'tag', filter: { protein_tag: 'fish' } },
  },
  'no-repeat-subzi': {
    name: 'No repeat subzi',
    ruleType: 'no-repeat',
    component_type: 'subzi',
  },
  'weekend-special': {
    name: 'Weekend special',
    ruleType: 'scheduling-rule',
    effect: 'filter-pool',
    days: ['saturday', 'sunday'],
    slots: [],
    match: { mode: 'tag', filter: { occasion_tag: 'weekend' } },
  },
  'no-paneer-weekdays': {
    name: 'No paneer weekdays',
    ruleType: 'scheduling-rule',
    effect: 'exclude',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    slots: [],
    match: { mode: 'tag', filter: { protein_tag: 'paneer' } },
  },
  'rice-lunch-dinner': {
    name: 'Rice: lunch and dinner only',
    ruleType: 'meal-template',
    base_type: 'rice-based',
    allowed_slots: ['lunch', 'dinner'],
    exclude_component_types: [],
    exclude_extra_categories: [],
    require_extra_category: null,
    days: [],
    slots: [],
  } as MealTemplateFormState,
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

const initialState: FormState = { name: '', ruleType: '' };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_NAME':
      return { ...state, name: action.name };

    case 'SET_RULE_TYPE': {
      const name = state.name;
      switch (action.ruleType) {
        case 'no-repeat':
          return { name, ruleType: 'no-repeat', component_type: '' };
        case 'scheduling-rule':
          return { name, ruleType: 'scheduling-rule', effect: '', days: [], slots: [], match: { mode: '' } };
        case 'meal-template':
          return { name, ruleType: 'meal-template', base_type: '', allowed_slots: [], exclude_component_types: [], exclude_extra_categories: [], require_extra_category: null, days: [], slots: [] };
      }
    }

    case 'SET_DAYS':
      if (state.ruleType === 'scheduling-rule') {
        return { ...state, days: action.days };
      }
      return state;

    case 'SET_SLOTS':
      if (state.ruleType === 'scheduling-rule') {
        return { ...state, slots: action.slots };
      }
      return state;

    case 'SET_COMPONENT_TYPE':
      if (state.ruleType === 'no-repeat') {
        return { ...state, component_type: action.component_type };
      }
      return state;

    case 'SET_EFFECT':
      if (state.ruleType === 'scheduling-rule') {
        return { ...state, effect: action.effect };
      }
      return state;

    case 'SET_MATCH_MODE':
      if (state.ruleType === 'scheduling-rule') {
        const match =
          action.mode === 'tag'
            ? { mode: 'tag' as const, filter: {} }
            : { mode: 'component' as const, component_id: null };
        return { ...state, match };
      }
      return state;

    case 'SET_SCHEDULING_TAG_FILTER':
      if (state.ruleType === 'scheduling-rule' && state.match.mode === 'tag') {
        return { ...state, match: { mode: 'tag' as const, filter: action.filter } };
      }
      return state;

    case 'SET_SCHEDULING_COMPONENT_ID':
      if (state.ruleType === 'scheduling-rule' && state.match.mode === 'component') {
        return { ...state, match: { mode: 'component' as const, component_id: action.component_id } };
      }
      return state;

    case 'SET_BASE_TYPE':
      if (state.ruleType === 'meal-template') {
        return { ...state, base_type: action.base_type };
      }
      return state;

    case 'SET_ALLOWED_SLOTS':
      if (state.ruleType === 'meal-template') {
        return { ...state, allowed_slots: action.allowed_slots };
      }
      return state;

    case 'SET_EXCLUDE_COMPONENT_TYPES':
      if (state.ruleType === 'meal-template') {
        return { ...state, exclude_component_types: action.exclude_component_types };
      }
      return state;

    case 'SET_EXCLUDE_EXTRA_CATEGORIES':
      if (state.ruleType === 'meal-template') {
        return { ...state, exclude_extra_categories: action.exclude_extra_categories };
      }
      return state;

    case 'SET_REQUIRE_EXTRA_CATEGORY':
      if (state.ruleType === 'meal-template') {
        return { ...state, require_extra_category: action.require_extra_category };
      }
      return state;

    case 'SET_TEMPLATE_DAYS':
      if (state.ruleType === 'meal-template') {
        return { ...state, days: action.days };
      }
      return state;

    case 'SET_TEMPLATE_SLOTS':
      if (state.ruleType === 'meal-template') {
        return { ...state, slots: action.slots };
      }
      return state;

    case 'LOAD_PRESET':
      return action.state;

    default:
      return state;
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isFormValid(state: FormState): boolean {
  if (state.name.trim() === '') return false;
  if (state.ruleType === '') return false;
  if (state.ruleType === 'no-repeat') return state.component_type !== '';
  if (state.ruleType === 'scheduling-rule') {
    if (state.effect === '') return false;
    if (state.match.mode === '') return false;
    if (state.match.mode === 'tag') {
      return Object.values(state.match.filter).some(v => v !== undefined);
    }
    if (state.match.mode === 'component') {
      return state.match.component_id !== null;
    }
    return false;
  }
  if (state.ruleType === 'meal-template') {
    if (state.base_type === '') return false;
    return (
      state.allowed_slots.length > 0 ||
      state.exclude_component_types.length > 0 ||
      state.exclude_extra_categories.length > 0 ||
      state.require_extra_category !== null
    );
  }
  return false;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RuleForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(formReducer, initialState);
  const [saving, setSaving] = useState(false);
  const presetLoadedRef = useRef(false);

  // Load preset from query param on mount (run only once)
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
      let def;
      if (state.ruleType === 'no-repeat') {
        def = {
          ruleType: 'no-repeat' as const,
          component_type: state.component_type as 'base' | 'curry' | 'subzi',
        };
      } else if (state.ruleType === 'scheduling-rule') {
        const match = state.match;
        if (match.mode !== 'tag' && match.mode !== 'component') return;
        def = {
          ruleType: 'scheduling-rule' as const,
          effect: state.effect as 'filter-pool' | 'require-one' | 'exclude',
          days: state.days.length > 0 ? state.days : undefined,
          slots: state.slots.length > 0 ? state.slots : undefined,
          match: match.mode === 'tag'
            ? { mode: 'tag' as const, filter: match.filter }
            : { mode: 'component' as const, component_id: match.component_id! },
        };
      } else if (state.ruleType === 'meal-template') {
        def = {
          ruleType: 'meal-template' as const,
          base_type: state.base_type as 'rice-based' | 'bread-based' | 'other',
          days: state.days.length > 0 ? state.days : undefined,
          slots: state.slots.length > 0 ? state.slots : undefined,
          allowed_slots: state.allowed_slots.length > 0 ? state.allowed_slots : undefined,
          exclude_component_types: state.exclude_component_types.length > 0 ? state.exclude_component_types : undefined,
          exclude_extra_categories: state.exclude_extra_categories.length > 0 ? state.exclude_extra_categories : undefined,
          require_extra_category: state.require_extra_category ?? undefined,
        };
      } else {
        return;
      }

      const compiled = compileRule(def);
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

  const valid = isFormValid(state);

  return (
    <main className="px-4 py-8 sm:px-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/rules">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-[28px] font-semibold font-heading">New Rule</h1>
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          handleSave();
        }}
        className="space-y-6"
      >
        {/* Rule name */}
        <div className="space-y-2">
          <Label htmlFor="rule-name">Rule name</Label>
          <Input
            id="rule-name"
            placeholder="e.g. Fish Fridays"
            value={state.name}
            onChange={e => dispatch({ type: 'SET_NAME', name: e.target.value })}
          />
        </div>

        {/* Rule type */}
        <div className="space-y-2">
          <Label>Rule type</Label>
          <Tabs
            value={state.ruleType}
            onValueChange={v =>
              dispatch({
                type: 'SET_RULE_TYPE',
                ruleType: v as 'no-repeat' | 'scheduling-rule' | 'meal-template',
              })
            }
          >
            <TabsList>
              <TabsTrigger value="no-repeat">No Repeat</TabsTrigger>
              <TabsTrigger value="scheduling-rule">Scheduling Rule</TabsTrigger>
              <TabsTrigger value="meal-template">Meal Template</TabsTrigger>
            </TabsList>
            <TabsContent value="no-repeat">
              {state.ruleType === 'no-repeat' && (
                <NoRepeatFields state={state} dispatch={dispatch} />
              )}
            </TabsContent>
            <TabsContent value="scheduling-rule">
              {state.ruleType === 'scheduling-rule' && (
                <SchedulingRuleFields state={state} dispatch={dispatch} />
              )}
            </TabsContent>
            <TabsContent value="meal-template">
              {state.ruleType === 'meal-template' && (
                <MealTemplateFields state={state} dispatch={dispatch} />
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Impact preview */}
        {state.ruleType !== '' && <RuleImpactPreview formState={state} />}

        {/* Save button */}
        <Button type="submit" disabled={!valid || saving}>
          {saving ? 'Saving...' : 'Save Rule'}
        </Button>
      </form>
    </main>
  );
}
