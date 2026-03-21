'use client';

import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Combobox } from '@/components/ui/combobox';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { getAllComponents } from '@/services/food-db';
import { ALL_DAYS } from '@/types/plan';
import type { MealSlot } from '@/types/preferences';
import type { RequireComponentFormState, FormAction } from '../types';

const ALL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface RequireComponentFieldsProps {
  state: RequireComponentFormState;
  dispatch: React.Dispatch<FormAction>;
}

export function RequireComponentFields({ state, dispatch }: RequireComponentFieldsProps) {
  const allComponents = useLiveQuery(() => getAllComponents()) ?? [];

  const options = allComponents
    .filter(c => c.componentType !== 'extra')
    .map(c => ({ value: String(c.id), label: c.name }));

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

  return (
    <div className="space-y-4 pt-3">
      {/* Component picker */}
      <div className="space-y-1.5">
        <Label>Component</Label>
        <Combobox
          options={options}
          value={state.component_id !== null ? String(state.component_id) : ''}
          onValueChange={v =>
            dispatch({
              type: 'SET_COMPONENT_ID',
              component_id: v ? Number(v) : null,
            })
          }
          placeholder="Select component..."
          className="w-full"
        />
      </div>

      {/* Days (required) */}
      <fieldset>
        <legend className="text-sm font-medium mb-2">Days</legend>
        <div className="flex flex-wrap gap-2">
          {ALL_DAYS.map(day => (
            <div key={day} className="flex items-center gap-1.5">
              <Checkbox
                id={`req-day-${day}`}
                checked={state.days.includes(day)}
                onCheckedChange={checked => toggleDay(day, checked === true)}
              />
              <Label htmlFor={`req-day-${day}`}>{capitalize(day)}</Label>
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
                id={`req-slot-${slot}`}
                checked={state.slots.includes(slot)}
                onCheckedChange={checked => toggleSlot(slot, checked === true)}
              />
              <Label htmlFor={`req-slot-${slot}`}>{capitalize(slot)}</Label>
            </div>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
