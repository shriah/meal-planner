'use client';

import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { NoRepeatFormState, FormAction } from '../types';

interface NoRepeatFieldsProps {
  state: NoRepeatFormState;
  dispatch: React.Dispatch<FormAction>;
}

export function NoRepeatFields({ state, dispatch }: NoRepeatFieldsProps) {
  return (
    <div className="space-y-4 pt-3">
      <div className="space-y-1.5">
        <Label htmlFor="no-repeat-component-type">Component type</Label>
        <Select
          value={state.component_type}
          onValueChange={v =>
            dispatch({
              type: 'SET_COMPONENT_TYPE',
              component_type: v as 'base' | 'curry' | 'subzi',
            })
          }
        >
          <SelectTrigger id="no-repeat-component-type" className="w-full">
            <SelectValue placeholder="Select type..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="base">Base</SelectItem>
            <SelectItem value="curry">Curry</SelectItem>
            <SelectItem value="subzi">Subzi</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
