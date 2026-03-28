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
import {
  EMPTY_RULE_FORM_STATE,
  EXAMPLE_PRESETS,
  formReducer,
  isFormValid,
} from './form-state';
import { RuleFields } from './RuleFormFields/RuleFields';
import { RuleImpactPreview } from './RuleImpactPreview';

// ─── Component ────────────────────────────────────────────────────────────────

export function RuleForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(formReducer, EMPTY_RULE_FORM_STATE);
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
