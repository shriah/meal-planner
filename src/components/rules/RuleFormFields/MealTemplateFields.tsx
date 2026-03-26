'use client';

import * as React from 'react';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Toggle } from '@/components/ui/toggle';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { ALL_DAYS } from '@/types/plan';
import type { MealSlot } from '@/types/preferences';
import type { ExtraCategory, ComponentType } from '@/types/component';
import type { TagFilter } from '@/types/plan';
import type { MealTemplateFormState, FormAction } from '../types';
import { db } from '@/db/client';

const ALL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
const ALL_EXTRA_CATEGORIES: ExtraCategory[] = ['liquid', 'crunchy', 'condiment', 'dairy', 'sweet'];
const EXCLUDE_COMPONENT_TYPES: ('curry' | 'subzi')[] = ['curry', 'subzi'];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface MealTemplateFieldsProps {
  state: MealTemplateFormState;
  dispatch: React.Dispatch<FormAction>;
}

export function MealTemplateFields({ state, dispatch }: MealTemplateFieldsProps) {
  const [componentPickerType, setComponentPickerType] = useState<'' | ComponentType>('');

  const filteredComponents = useLiveQuery(async () => {
    if (!componentPickerType) return [];
    return db.components.where('componentType').equals(componentPickerType).toArray();
  }, [componentPickerType]) ?? [];

  const componentOptions = filteredComponents.map(c => ({
    value: String(c.id),
    label: c.name,
  }));

  const updateTagFilter = (key: string, value: string) => {
    if (state.selector.mode !== 'tag') return;
    const updated: TagFilter = {
      ...state.selector.filter,
      [key]: value === 'any' ? undefined : value,
    };
    dispatch({ type: 'SET_TEMPLATE_TAG_FILTER', filter: updated });
  };

  return (
    <div className="space-y-4 pt-3">
      {/* Section 1 — Selector mode (Base / Tag / Component) */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Selector type</Label>
        <RadioGroup
          className="flex gap-4"
          value={state.selector.mode || undefined}
          onValueChange={v =>
            dispatch({ type: 'SET_TEMPLATE_SELECTOR_MODE', mode: v as 'base' | 'tag' | 'component' })
          }
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="base" id="tmpl-sel-base" />
            <Label htmlFor="tmpl-sel-base">Base type</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="tag" id="tmpl-sel-tag" />
            <Label htmlFor="tmpl-sel-tag">Tag</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="component" id="tmpl-sel-component" />
            <Label htmlFor="tmpl-sel-component">Component</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Section 1a — Base type sub-options */}
      {state.selector.mode === 'base' && (
        <div className="space-y-2 pl-4 border-l-2 border-muted">
          <Label className="text-sm font-medium">Base type</Label>
          <RadioGroup
            className="flex gap-4"
            value={state.selector.base_type || undefined}
            onValueChange={v =>
              dispatch({ type: 'SET_TEMPLATE_BASE_TYPE', base_type: v as 'rice-based' | 'bread-based' | 'other' })
            }
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="rice-based" id="tmpl-base-rice" />
              <Label htmlFor="tmpl-base-rice">Rice-based</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="bread-based" id="tmpl-base-bread" />
              <Label htmlFor="tmpl-base-bread">Bread-based</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="other" id="tmpl-base-other" />
              <Label htmlFor="tmpl-base-other">Other</Label>
            </div>
          </RadioGroup>
        </div>
      )}

      {/* Section 1b — Tag filter sub-options */}
      {state.selector.mode === 'tag' && (
        <div className="space-y-2 pl-4 border-l-2 border-muted">
          <Label className="text-sm font-medium">Tag filters</Label>
          <div className="grid grid-cols-2 gap-4">
            {/* Dietary */}
            <div className="space-y-1.5">
              <Label htmlFor="tmpl-filter-dietary">Dietary</Label>
              <Select
                value={state.selector.filter.dietary_tag ?? 'any'}
                onValueChange={v => updateTagFilter('dietary_tag', v)}
              >
                <SelectTrigger id="tmpl-filter-dietary" className="w-full">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="veg">Veg</SelectItem>
                  <SelectItem value="non-veg">Non-veg</SelectItem>
                  <SelectItem value="vegan">Vegan</SelectItem>
                  <SelectItem value="jain">Jain</SelectItem>
                  <SelectItem value="eggetarian">Eggetarian</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Protein */}
            <div className="space-y-1.5">
              <Label htmlFor="tmpl-filter-protein">Protein</Label>
              <Select
                value={state.selector.filter.protein_tag ?? 'any'}
                onValueChange={v => updateTagFilter('protein_tag', v)}
              >
                <SelectTrigger id="tmpl-filter-protein" className="w-full">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="fish">Fish</SelectItem>
                  <SelectItem value="chicken">Chicken</SelectItem>
                  <SelectItem value="mutton">Mutton</SelectItem>
                  <SelectItem value="egg">Egg</SelectItem>
                  <SelectItem value="paneer">Paneer</SelectItem>
                  <SelectItem value="dal">Dal</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Regional */}
            <div className="space-y-1.5">
              <Label htmlFor="tmpl-filter-regional">Regional</Label>
              <Select
                value={state.selector.filter.regional_tag ?? 'any'}
                onValueChange={v => updateTagFilter('regional_tag', v)}
              >
                <SelectTrigger id="tmpl-filter-regional" className="w-full">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="south-indian">South Indian</SelectItem>
                  <SelectItem value="north-indian">North Indian</SelectItem>
                  <SelectItem value="coastal-konkan">Coastal Konkan</SelectItem>
                  <SelectItem value="pan-indian">Pan Indian</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Occasion */}
            <div className="space-y-1.5">
              <Label htmlFor="tmpl-filter-occasion">Occasion</Label>
              <Select
                value={state.selector.filter.occasion_tag ?? 'any'}
                onValueChange={v => updateTagFilter('occasion_tag', v)}
              >
                <SelectTrigger id="tmpl-filter-occasion" className="w-full">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="everyday">Everyday</SelectItem>
                  <SelectItem value="weekday">Weekday</SelectItem>
                  <SelectItem value="weekend">Weekend</SelectItem>
                  <SelectItem value="fasting">Fasting</SelectItem>
                  <SelectItem value="festive">Festive</SelectItem>
                  <SelectItem value="monday">Monday</SelectItem>
                  <SelectItem value="tuesday">Tuesday</SelectItem>
                  <SelectItem value="wednesday">Wednesday</SelectItem>
                  <SelectItem value="thursday">Thursday</SelectItem>
                  <SelectItem value="friday">Friday</SelectItem>
                  <SelectItem value="saturday">Saturday</SelectItem>
                  <SelectItem value="sunday">Sunday</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Section 1c — Component picker sub-options */}
      {state.selector.mode === 'component' && (
        <div className="space-y-3 pl-4 border-l-2 border-muted">
          <div className="space-y-1.5">
            <Label>Component type</Label>
            <Select
              value={componentPickerType || undefined}
              onValueChange={v => {
                setComponentPickerType(v as ComponentType);
                dispatch({ type: 'SET_TEMPLATE_COMPONENT_ID', component_id: null });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="base">Base</SelectItem>
                <SelectItem value="curry">Curry</SelectItem>
                <SelectItem value="subzi">Subzi</SelectItem>
                <SelectItem value="extra">Extra</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Component</Label>
            <Combobox
              options={componentPickerType === '' ? [] : componentOptions}
              value={
                state.selector.mode === 'component' && state.selector.component_id !== null
                  ? String(state.selector.component_id)
                  : ''
              }
              onValueChange={v =>
                dispatch({
                  type: 'SET_TEMPLATE_COMPONENT_ID',
                  component_id: v ? Number(v) : null,
                })
              }
              placeholder={componentPickerType === '' ? 'Select type first' : 'Select component...'}
              className="w-full"
            />
          </div>
        </div>
      )}

      {/* Section 2 — Slot assignment */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Slot assignment</Label>
        <p className="text-sm text-muted-foreground">
          Slots this selector is allowed in (leave empty for unrestricted)
        </p>
        <div className="flex gap-2">
          {ALL_SLOTS.map(slot => (
            <Toggle
              key={slot}
              variant="outline"
              pressed={state.allowed_slots.includes(slot)}
              onPressedChange={pressed => {
                const updated = pressed
                  ? [...state.allowed_slots, slot]
                  : state.allowed_slots.filter(s => s !== slot);
                dispatch({ type: 'SET_ALLOWED_SLOTS', allowed_slots: updated });
              }}
              className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              {capitalize(slot)}
            </Toggle>
          ))}
        </div>
      </div>

      {/* Section 3 — Exclude component types */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Exclude components</Label>
        <div className="flex flex-wrap gap-2">
          {EXCLUDE_COMPONENT_TYPES.map(ct => (
            <div key={ct} className="flex items-center gap-1.5">
              <Checkbox
                id={`tmpl-excl-ct-${ct}`}
                checked={state.exclude_component_types.includes(ct)}
                onCheckedChange={checked => {
                  const updated = checked
                    ? [...state.exclude_component_types, ct]
                    : state.exclude_component_types.filter(c => c !== ct);
                  dispatch({ type: 'SET_EXCLUDE_COMPONENT_TYPES', exclude_component_types: updated });
                }}
              />
              <Label htmlFor={`tmpl-excl-ct-${ct}`}>{capitalize(ct)}</Label>
            </div>
          ))}
        </div>
      </div>

      {/* Section 4 — Exclude extra categories */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Exclude extras</Label>
        <div className="flex flex-wrap gap-2">
          {ALL_EXTRA_CATEGORIES.map(cat => (
            <div key={cat} className="flex items-center gap-1.5">
              <Checkbox
                id={`tmpl-excl-extra-${cat}`}
                checked={state.exclude_extra_categories.includes(cat)}
                onCheckedChange={checked => {
                  const updated = checked
                    ? [...state.exclude_extra_categories, cat]
                    : state.exclude_extra_categories.filter(c => c !== cat);
                  dispatch({ type: 'SET_EXCLUDE_EXTRA_CATEGORIES', exclude_extra_categories: updated });
                }}
              />
              <Label htmlFor={`tmpl-excl-extra-${cat}`}>{capitalize(cat)}</Label>
            </div>
          ))}
        </div>
      </div>

      {/* Section 5 — Require extra category */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Require extra</Label>
        <Select
          value={state.require_extra_category ?? 'none'}
          onValueChange={v =>
            dispatch({
              type: 'SET_REQUIRE_EXTRA_CATEGORY',
              require_extra_category: v === 'none' ? null : (v as ExtraCategory),
            })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="None (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None (optional)</SelectItem>
            {ALL_EXTRA_CATEGORIES.map(cat => (
              <SelectItem key={cat} value={cat}>
                {capitalize(cat)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Section 6 — Composition scope — Days */}
      <fieldset>
        <legend className="text-sm font-medium mb-2">Composition scope -- days (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {ALL_DAYS.map(day => (
            <div key={day} className="flex items-center gap-1.5">
              <Checkbox
                id={`tmpl-day-${day}`}
                checked={state.days.includes(day)}
                onCheckedChange={checked => {
                  const updated = checked
                    ? [...state.days, day]
                    : state.days.filter(d => d !== day);
                  dispatch({ type: 'SET_TEMPLATE_DAYS', days: updated });
                }}
              />
              <Label htmlFor={`tmpl-day-${day}`}>{capitalize(day)}</Label>
            </div>
          ))}
        </div>
      </fieldset>

      {/* Section 7 — Composition scope — Slots */}
      <fieldset>
        <legend className="text-sm font-medium mb-2">Composition scope -- slots (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {ALL_SLOTS.map(slot => (
            <div key={slot} className="flex items-center gap-1.5">
              <Checkbox
                id={`tmpl-scope-slot-${slot}`}
                checked={state.slots.includes(slot)}
                onCheckedChange={checked => {
                  const updated = checked
                    ? [...state.slots, slot]
                    : state.slots.filter(s => s !== slot);
                  dispatch({ type: 'SET_TEMPLATE_SLOTS', slots: updated });
                }}
              />
              <Label htmlFor={`tmpl-scope-slot-${slot}`}>{capitalize(slot)}</Label>
            </div>
          ))}
        </div>
      </fieldset>

      {/* Inline hint */}
      <p className="text-sm text-muted-foreground">
        Days and slots above scope when exclusions and requirements apply. Slot assignment always applies.
      </p>
    </div>
  );
}
