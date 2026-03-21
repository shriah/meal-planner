'use client';

import * as React from 'react';
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
import type { DayFilterFormState, FormAction } from '../types';

const ALL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface DayFilterFieldsProps {
  state: DayFilterFormState;
  dispatch: React.Dispatch<FormAction>;
}

export function DayFilterFields({ state, dispatch }: DayFilterFieldsProps) {
  const toggleDay = (day: typeof ALL_DAYS[number], checked: boolean) => {
    const updated = checked
      ? [...state.days, day]
      : state.days.filter(d => d !== day);
    dispatch({ type: 'SET_DAYS', days: updated });
  };

  const toggleSlot = (slot: MealSlot, checked: boolean) => {
    const updated = checked
      ? [...state.slots, slot]
      : state.slots.filter(s => s !== slot);
    dispatch({ type: 'SET_SLOTS', slots: updated });
  };

  const updateFilter = (key: string, value: string) => {
    dispatch({
      type: 'SET_FILTER',
      filter: {
        ...state.filter,
        [key]: value || undefined,
      },
    });
  };

  return (
    <div className="space-y-4 pt-3">
      {/* Days (required) */}
      <fieldset>
        <legend className="text-sm font-medium mb-2">Days</legend>
        <div className="flex flex-wrap gap-2">
          {ALL_DAYS.map(day => (
            <div key={day} className="flex items-center gap-1.5">
              <Checkbox
                id={`day-${day}`}
                checked={state.days.includes(day)}
                onCheckedChange={checked => toggleDay(day, checked === true)}
              />
              <Label htmlFor={`day-${day}`}>{capitalize(day)}</Label>
            </div>
          ))}
        </div>
      </fieldset>

      {/* Slots (optional) */}
      <fieldset>
        <legend className="text-sm font-medium mb-2">Slots (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {ALL_SLOTS.map(slot => (
            <div key={slot} className="flex items-center gap-1.5">
              <Checkbox
                id={`slot-${slot}`}
                checked={state.slots.includes(slot)}
                onCheckedChange={checked => toggleSlot(slot, checked === true)}
              />
              <Label htmlFor={`slot-${slot}`}>{capitalize(slot)}</Label>
            </div>
          ))}
        </div>
      </fieldset>

      {/* Tag filters (optional) */}
      <div>
        <p className="text-sm font-medium mb-2">Tag filters (optional)</p>
        <div className="grid grid-cols-2 gap-4">
          {/* Dietary */}
          <div className="space-y-1.5">
            <Label htmlFor="filter-dietary">Dietary</Label>
            <Select
              value={state.filter.dietary_tag ?? ''}
              onValueChange={v => updateFilter('dietary_tag', v)}
            >
              <SelectTrigger id="filter-dietary" className="w-full">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any</SelectItem>
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
            <Label htmlFor="filter-protein">Protein</Label>
            <Select
              value={state.filter.protein_tag ?? ''}
              onValueChange={v => updateFilter('protein_tag', v)}
            >
              <SelectTrigger id="filter-protein" className="w-full">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any</SelectItem>
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
            <Label htmlFor="filter-regional">Regional</Label>
            <Select
              value={state.filter.regional_tag ?? ''}
              onValueChange={v => updateFilter('regional_tag', v)}
            >
              <SelectTrigger id="filter-regional" className="w-full">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any</SelectItem>
                <SelectItem value="south-indian">South Indian</SelectItem>
                <SelectItem value="north-indian">North Indian</SelectItem>
                <SelectItem value="coastal-konkan">Coastal Konkan</SelectItem>
                <SelectItem value="pan-indian">Pan Indian</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Occasion */}
          <div className="space-y-1.5">
            <Label htmlFor="filter-occasion">Occasion</Label>
            <Select
              value={state.filter.occasion_tag ?? ''}
              onValueChange={v => updateFilter('occasion_tag', v)}
            >
              <SelectTrigger id="filter-occasion" className="w-full">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any</SelectItem>
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
    </div>
  );
}
