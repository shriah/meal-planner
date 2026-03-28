'use client';

import * as React from 'react';
import type { Dispatch } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Toggle } from '@/components/ui/toggle';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import type { ComboboxOption } from '@/components/ui/combobox';
import { useLiveQuery } from 'dexie-react-hooks';
import { getAllComponents } from '@/services/food-db';
import { ALL_DAYS } from '@/types/plan';
import type { RuleFormState, FormAction, TargetFormState } from '../types';
import type { TagFilter } from '@/types/plan';
import type { MealSlot } from '@/types/preferences';
import type { ExtraCategory } from '@/types/component';

const ALL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
const EXTRA_CATEGORIES: ExtraCategory[] = ['liquid', 'crunchy', 'condiment', 'dairy', 'sweet'];
const TAG_DIETARY = ['veg', 'non-veg', 'vegan', 'jain', 'eggetarian'] as const;
const TAG_PROTEIN = ['fish', 'chicken', 'mutton', 'egg', 'paneer', 'dal', 'none'] as const;
const TAG_REGIONAL = ['south-indian', 'north-indian', 'coastal-konkan', 'pan-indian'] as const;
const TAG_OCCASION = ['everyday', 'weekday', 'weekend', 'fasting', 'festive', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

interface Props {
  state: RuleFormState;
  dispatch: Dispatch<FormAction>;
}

// ─── Tag filter grid ──────────────────────────────────────────────────────────

function TagFilterGrid({ filter, onChange }: { filter: TagFilter; onChange: (f: TagFilter) => void }) {
  return (
    <div className="space-y-3">
      {/* Dietary */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Dietary</p>
        <div className="flex flex-wrap gap-1">
          {TAG_DIETARY.map(t => (
            <Toggle key={t} size="sm" pressed={filter.dietary_tag === t}
              onPressedChange={p => onChange({ ...filter, dietary_tag: p ? t : undefined })}>
              {t}
            </Toggle>
          ))}
        </div>
      </div>
      {/* Protein */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Protein</p>
        <div className="flex flex-wrap gap-1">
          {TAG_PROTEIN.map(t => (
            <Toggle key={t} size="sm" pressed={filter.protein_tag === t}
              onPressedChange={p => onChange({ ...filter, protein_tag: p ? t : undefined })}>
              {t}
            </Toggle>
          ))}
        </div>
      </div>
      {/* Regional */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Regional</p>
        <div className="flex flex-wrap gap-1">
          {TAG_REGIONAL.map(t => (
            <Toggle key={t} size="sm" pressed={filter.regional_tag === t}
              onPressedChange={p => onChange({ ...filter, regional_tag: p ? t : undefined })}>
              {t}
            </Toggle>
          ))}
        </div>
      </div>
      {/* Occasion */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Occasion</p>
        <div className="flex flex-wrap gap-1">
          {TAG_OCCASION.map(t => (
            <Toggle key={t} size="sm" pressed={filter.occasion_tag === t}
              onPressedChange={p => onChange({ ...filter, occasion_tag: p ? t : undefined })}>
              {t}
            </Toggle>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Component picker ─────────────────────────────────────────────────────────

function ComponentPicker({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const allComponents = useLiveQuery(() => getAllComponents()) ?? [];
  const options: ComboboxOption[] = allComponents.map(c => ({
    value: String(c.id),
    label: c.name,
  }));

  return (
    <Combobox
      options={options}
      value={value !== null ? String(value) : ''}
      onValueChange={v => onChange(v ? Number(v) : null)}
      placeholder="Select component..."
      searchPlaceholder="Search components..."
      className="w-full"
    />
  );
}

// ─── Target section ───────────────────────────────────────────────────────────

function TargetSection({ state, dispatch }: Props) {
  const target = state.target;

  return (
    <div className="space-y-3">
      <Label>Target — what are you constraining?</Label>
      <RadioGroup
        value={target.mode}
        onValueChange={v => dispatch({ type: 'SET_TARGET_MODE', mode: v as 'component_type' | 'tag' | 'component' | 'base_type' })}
        className="space-y-1"
      >
        {(['component_type', 'tag', 'component', 'base_type'] as const).map(mode => (
          <div key={mode} className="flex items-center space-x-2">
            <RadioGroupItem value={mode} id={`target-${mode}`} />
            <Label htmlFor={`target-${mode}`} className="font-normal cursor-pointer">
              {mode === 'component_type' && 'All bases / curries / subzis'}
              {mode === 'tag' && 'By tag'}
              {mode === 'component' && 'Specific component'}
              {mode === 'base_type' && 'Base type'}
            </Label>
          </div>
        ))}
      </RadioGroup>

      {/* Sub-options */}
      {target.mode === 'component_type' && (
        <RadioGroup
          value={target.component_type}
          onValueChange={v => dispatch({ type: 'SET_TARGET_COMPONENT_TYPE', component_type: v as 'base' | 'curry' | 'subzi' })}
          className="flex gap-4 pt-1"
        >
          {(['base', 'curry', 'subzi'] as const).map(ct => (
            <div key={ct} className="flex items-center space-x-2">
              <RadioGroupItem value={ct} id={`ct-${ct}`} />
              <Label htmlFor={`ct-${ct}`} className="font-normal cursor-pointer capitalize">{ct}</Label>
            </div>
          ))}
        </RadioGroup>
      )}

      {target.mode === 'tag' && (
        <TagFilterGrid
          filter={target.filter}
          onChange={f => dispatch({ type: 'SET_TARGET_TAG_FILTER', filter: f })}
        />
      )}

      {target.mode === 'component' && (
        <ComponentPicker
          value={target.component_id}
          onChange={id => dispatch({ type: 'SET_TARGET_COMPONENT_ID', component_id: id })}
        />
      )}

      {target.mode === 'base_type' && (
        <RadioGroup
          value={target.base_type}
          onValueChange={v => dispatch({ type: 'SET_TARGET_BASE_TYPE', base_type: v as 'rice-based' | 'bread-based' | 'other' })}
          className="flex gap-4 pt-1"
        >
          {(['rice-based', 'bread-based', 'other'] as const).map(bt => (
            <div key={bt} className="flex items-center space-x-2">
              <RadioGroupItem value={bt} id={`bt-${bt}`} />
              <Label htmlFor={`bt-${bt}`} className="font-normal cursor-pointer">{bt}</Label>
            </div>
          ))}
        </RadioGroup>
      )}
    </div>
  );
}

// ─── Scope section ────────────────────────────────────────────────────────────

function ScopeSection({ state, dispatch }: Props) {
  const allDaysActive = state.days.length === 0;
  const allSlotsActive = state.slots.length === 0;

  return (
    <div className="space-y-3">
      <Label>Scope <span className="text-muted-foreground font-normal">(defaults to all days, all slots)</span></Label>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Days</p>
        <div className="flex flex-wrap gap-1">
          {ALL_DAYS.map(d => (
            <Toggle key={d} size="sm"
              pressed={state.days.includes(d)}
              onPressedChange={p => {
                const next = p ? [...state.days, d] : state.days.filter(x => x !== d);
                dispatch({ type: 'SET_DAYS', days: next });
              }}>
              {d.slice(0, 3)}
            </Toggle>
          ))}
        </div>
        {!allDaysActive && (
          <button className="text-xs text-muted-foreground underline" onClick={() => dispatch({ type: 'SET_DAYS', days: [] })}>
            Clear (all days)
          </button>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Slots</p>
        <div className="flex gap-1">
          {ALL_SLOTS.map(s => (
            <Toggle key={s} size="sm"
              pressed={state.slots.includes(s)}
              onPressedChange={p => {
                const next = p ? [...state.slots, s] : state.slots.filter(x => x !== s);
                dispatch({ type: 'SET_SLOTS', slots: next });
              }}>
              {s}
            </Toggle>
          ))}
        </div>
        {!allSlotsActive && (
          <button className="text-xs text-muted-foreground underline" onClick={() => dispatch({ type: 'SET_SLOTS', slots: [] })}>
            Clear (all slots)
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Effects section ──────────────────────────────────────────────────────────

function EffectsSection({ state, dispatch }: Props) {
  const SELECTION_OPTIONS = [
    { value: '', label: 'None' },
    { value: 'filter_pool', label: 'Filter pool — only allow matching components in scope' },
    { value: 'require_one', label: 'Require one — always include a matching component' },
    { value: 'exclude', label: 'Exclude — never include matching components' },
    { value: 'no_repeat', label: "No-repeat — don't reuse the same component across the week" },
  ] as const;

  const toggleSkipType = (ct: 'curry' | 'subzi') => {
    const next = state.skip_component_types.includes(ct)
      ? state.skip_component_types.filter(x => x !== ct)
      : [...state.skip_component_types, ct];
    dispatch({ type: 'SET_SKIP_COMPONENT_TYPES', skip_component_types: next });
  };

  const toggleRequireExtra = (cat: ExtraCategory) => {
    const next = state.require_extra_categories.includes(cat)
      ? state.require_extra_categories.filter(x => x !== cat)
      : [...state.require_extra_categories, cat];
    dispatch({ type: 'SET_REQUIRE_EXTRA_CATEGORIES', categories: next });
  };

  return (
    <div className="space-y-5">
      {/* Selection */}
      <div className="space-y-2">
        <Label>Selection</Label>
        <RadioGroup
          value={state.selection}
          onValueChange={v => dispatch({ type: 'SET_SELECTION', selection: v as RuleFormState['selection'] })}
          className="space-y-1"
        >
          {SELECTION_OPTIONS.map(opt => (
            <div key={opt.value} className="flex items-center space-x-2">
              <RadioGroupItem value={opt.value} id={`sel-${opt.value || 'none'}`} />
              <Label htmlFor={`sel-${opt.value || 'none'}`} className="font-normal cursor-pointer">{opt.label}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* When this target appears */}
      <div className="space-y-4 border-t pt-4">
        <Label className="text-sm font-medium">When this target appears</Label>

        {/* Restrict to slots */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Restrict to slots</p>
          <div className="flex gap-1">
            {ALL_SLOTS.map(s => (
              <Toggle key={s} size="sm"
                pressed={state.allowed_slots.includes(s)}
                onPressedChange={p => {
                  const next = p ? [...state.allowed_slots, s] : state.allowed_slots.filter(x => x !== s);
                  dispatch({ type: 'SET_ALLOWED_SLOTS', allowed_slots: next });
                }}>
                {s}
              </Toggle>
            ))}
          </div>
        </div>

        {/* Skip component types */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Skip component types</p>
          <div className="flex gap-4">
            {(['curry', 'subzi'] as const).map(ct => (
              <div key={ct} className="flex items-center space-x-2">
                <Checkbox id={`skip-${ct}`}
                  checked={state.skip_component_types.includes(ct)}
                  onCheckedChange={() => toggleSkipType(ct)} />
                <Label htmlFor={`skip-${ct}`} className="font-normal cursor-pointer capitalize">{ct}</Label>
              </div>
            ))}
          </div>
        </div>

        {/* Require extra categories */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Require extra categories</p>
          <div className="flex flex-wrap gap-2">
            {EXTRA_CATEGORIES.map(cat => (
              <div key={cat} className="flex items-center space-x-2">
                <Checkbox id={`req-${cat}`}
                  checked={state.require_extra_categories.includes(cat)}
                  onCheckedChange={() => toggleRequireExtra(cat)} />
                <Label htmlFor={`req-${cat}`} className="font-normal cursor-pointer">{cat}</Label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function RuleFields({ state, dispatch }: Props) {
  const targetSet = state.target.mode !== '';

  return (
    <div className="space-y-6">
      <TargetSection state={state} dispatch={dispatch} />
      {targetSet && (
        <>
          <ScopeSection state={state} dispatch={dispatch} />
          <EffectsSection state={state} dispatch={dispatch} />
        </>
      )}
    </div>
  );
}
