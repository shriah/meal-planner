'use client';

import * as React from 'react';
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
import { ALL_DAYS } from '@/types/plan';
import type { MealSlot } from '@/types/preferences';
import type { ExtraCategory } from '@/types/component';
import type { MealTemplateFormState, FormAction } from '../types';

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
  return (
    <div className="space-y-4 pt-3">
      {/* Section 1 — Base type RadioGroup (required) */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Base type</Label>
        <RadioGroup
          className="flex gap-4"
          value={state.base_type || undefined}
          onValueChange={v =>
            dispatch({ type: 'SET_BASE_TYPE', base_type: v as 'rice-based' | 'bread-based' | 'other' })
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

      {/* Section 2 — Slot assignment */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Slot assignment</Label>
        <p className="text-sm text-muted-foreground">
          Slots this base type is allowed in (leave empty for unrestricted)
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
