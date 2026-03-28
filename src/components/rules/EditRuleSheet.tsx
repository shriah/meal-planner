'use client';

import { useEffect, useReducer, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { RuleRecord } from '@/db/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { getCategoriesByKind } from '@/services/category-db';
import { updateRule } from '@/services/food-db';
import { compileRule, decompileRule } from '@/services/rule-compiler';
import {
  EMPTY_RULE_FORM_STATE,
  formReducer,
  isFormValid,
} from './form-state';
import { RuleImpactPreview } from './RuleImpactPreview';
import { RuleFields } from './RuleFormFields/RuleFields';

interface EditRuleSheetProps {
  rule: RuleRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditRuleSheet({
  rule,
  open,
  onOpenChange,
}: EditRuleSheetProps) {
  const [state, dispatch] = useReducer(formReducer, EMPTY_RULE_FORM_STATE);
  const [saving, setSaving] = useState(false);
  const baseCategories = useLiveQuery(() => getCategoriesByKind('base'), [], []);
  const extraCategories = useLiveQuery(() => getCategoriesByKind('extra'), [], []);

  useEffect(() => {
    if (!open) {
      return;
    }

    dispatch({
      type: 'LOAD_PRESET',
      state: decompileRule(rule.compiled_filter, rule.name, {
        baseCategoryIds: baseCategories.flatMap((category) => category.id ?? []),
        extraCategoryIds: extraCategories.flatMap((category) => category.id ?? []),
      }),
    });
  }, [baseCategories, extraCategories, open, rule]);

  async function handleSave() {
    if (!isFormValid(state) || saving || rule.id == null) {
      return;
    }

    setSaving(true);

    try {
      await updateRule(rule.id, {
        name: state.name.trim(),
        compiled_filter: compileRule(state),
        enabled: rule.enabled,
      });
      onOpenChange(false);
    } catch {
      toast.error('Failed to save rule. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Edit Rule</SheetTitle>
          <SheetDescription>
            Changes are saved when you click Save Rule.
          </SheetDescription>
        </SheetHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-6">
            <div className="space-y-2">
              <Label htmlFor={`rule-name-${rule.id ?? 'draft'}`}>Rule name</Label>
              <Input
                id={`rule-name-${rule.id ?? 'draft'}`}
                value={state.name}
                onChange={(event) =>
                  dispatch({ type: 'SET_NAME', name: event.target.value })
                }
              />
            </div>

            <RuleFields state={state} dispatch={dispatch} />

            {state.target.mode !== '' && <RuleImpactPreview formState={state} />}
          </div>

          <SheetFooter>
            <Button type="submit" disabled={!isFormValid(state) || saving}>
              {saving ? 'Saving...' : 'Save Rule'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Discard Changes
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
