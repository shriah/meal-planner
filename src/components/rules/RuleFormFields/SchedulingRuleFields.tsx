'use client';

import * as React from 'react';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { ALL_DAYS } from '@/types/plan';
import type { MealSlot } from '@/types/preferences';
import { getAllComponents } from '@/services/food-db';
import type { SchedulingRuleFormState, FormAction } from '../types';

const ALL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface SchedulingRuleFieldsProps {
  state: SchedulingRuleFormState;
  dispatch: React.Dispatch<FormAction>;
}

export function SchedulingRuleFields({ state, dispatch }: SchedulingRuleFieldsProps) {
  const [pickedType, setPickedType] = useState<'' | 'base' | 'curry' | 'subzi'>('');

  const allComponents = useLiveQuery(() => getAllComponents()) ?? [];
  const filteredOptions = allComponents
    .filter(c => c.componentType === pickedType)
    .map(c => ({ value: String(c.id), label: c.name }));

  const updateTagFilter = (key: string, value: string) => {
    if (state.match.mode !== 'tag') return;
    dispatch({
      type: 'SET_SCHEDULING_TAG_FILTER',
      filter: { ...state.match.filter, [key]: value === 'any' ? undefined : value },
    });
  };

  return (
    <div className="space-y-4 pt-3">
      {/* Section 1 — Effect selector */}
      <Tabs
        value={state.effect || undefined}
        onValueChange={v =>
          dispatch({ type: 'SET_EFFECT', effect: v as 'filter-pool' | 'require-one' | 'exclude' })
        }
      >
        <TabsList>
          <TabsTrigger value="filter-pool">Only allow</TabsTrigger>
          <TabsTrigger value="require-one">Always include</TabsTrigger>
          <TabsTrigger value="exclude">Never include</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Section 2 — Match mode radio (visible when effect is selected) */}
      {state.effect !== '' && (
        <RadioGroup
          value={state.match.mode || undefined}
          onValueChange={v =>
            dispatch({ type: 'SET_MATCH_MODE', mode: v as 'tag' | 'component' })
          }
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="tag" id="match-tag" />
              <Label htmlFor="match-tag">By tag</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="component" id="match-component" />
              <Label htmlFor="match-component">Specific component</Label>
            </div>
          </div>
        </RadioGroup>
      )}

      {/* Section 3a — Tag filter grid (when match mode = tag) */}
      {state.match.mode === 'tag' && (
        <div>
          <p className="text-sm font-medium mb-2">Tag filters</p>
          <div className="grid grid-cols-2 gap-4">
            {/* Dietary */}
            <div className="space-y-1.5">
              <Label htmlFor="sched-filter-dietary">Dietary</Label>
              <Select
                value={state.match.filter.dietary_tag ?? 'any'}
                onValueChange={v => updateTagFilter('dietary_tag', v)}
              >
                <SelectTrigger id="sched-filter-dietary" className="w-full">
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
              <Label htmlFor="sched-filter-protein">Protein</Label>
              <Select
                value={state.match.filter.protein_tag ?? 'any'}
                onValueChange={v => updateTagFilter('protein_tag', v)}
              >
                <SelectTrigger id="sched-filter-protein" className="w-full">
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
              <Label htmlFor="sched-filter-regional">Regional</Label>
              <Select
                value={state.match.filter.regional_tag ?? 'any'}
                onValueChange={v => updateTagFilter('regional_tag', v)}
              >
                <SelectTrigger id="sched-filter-regional" className="w-full">
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
              <Label htmlFor="sched-filter-occasion">Occasion</Label>
              <Select
                value={state.match.filter.occasion_tag ?? 'any'}
                onValueChange={v => updateTagFilter('occasion_tag', v)}
              >
                <SelectTrigger id="sched-filter-occasion" className="w-full">
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

      {/* Section 3b — Component picker two-step (when match mode = component) */}
      {state.match.mode === 'component' && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Component type</Label>
            <Select
              value={pickedType || undefined}
              onValueChange={v => {
                setPickedType(v as 'base' | 'curry' | 'subzi');
                dispatch({ type: 'SET_SCHEDULING_COMPONENT_ID', component_id: null });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="base">Base</SelectItem>
                <SelectItem value="curry">Curry</SelectItem>
                <SelectItem value="subzi">Subzi</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Component</Label>
            <Combobox
              options={pickedType === '' ? [] : filteredOptions}
              value={
                state.match.mode === 'component' && state.match.component_id !== null
                  ? String(state.match.component_id)
                  : ''
              }
              onValueChange={v =>
                dispatch({
                  type: 'SET_SCHEDULING_COMPONENT_ID',
                  component_id: v ? Number(v) : null,
                })
              }
              placeholder={pickedType === '' ? 'Select type first' : 'Select component...'}
              className="w-full"
            />
          </div>
        </div>
      )}

      {/* Section 4 — Days (optional) */}
      <fieldset>
        <legend className="text-sm font-medium mb-2">Days (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {ALL_DAYS.map(day => (
            <div key={day} className="flex items-center gap-1.5">
              <Checkbox
                id={`sched-day-${day}`}
                checked={state.days.includes(day)}
                onCheckedChange={checked => {
                  const updated = checked ? [...state.days, day] : state.days.filter(d => d !== day);
                  dispatch({ type: 'SET_DAYS', days: updated });
                }}
              />
              <Label htmlFor={`sched-day-${day}`}>{capitalize(day)}</Label>
            </div>
          ))}
        </div>
      </fieldset>

      {/* Section 5 — Slots (optional) */}
      <fieldset>
        <legend className="text-sm font-medium mb-2">Slots (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {ALL_SLOTS.map(slot => (
            <div key={slot} className="flex items-center gap-1.5">
              <Checkbox
                id={`sched-slot-${slot}`}
                checked={state.slots.includes(slot)}
                onCheckedChange={checked => {
                  const updated = checked
                    ? [...state.slots, slot]
                    : state.slots.filter(s => s !== slot);
                  dispatch({ type: 'SET_SLOTS', slots: updated });
                }}
              />
              <Label htmlFor={`sched-slot-${slot}`}>{capitalize(slot)}</Label>
            </div>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
