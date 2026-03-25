'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { TriangleAlert as TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getAllComponents } from '@/services/food-db';
import type { FormState } from './types';

interface RuleImpactPreviewProps {
  formState: FormState;
}

export function RuleImpactPreview({ formState }: RuleImpactPreviewProps) {
  const allComponents = useLiveQuery(() => getAllComponents()) ?? [];

  const impact = useMemo(() => {
    if (formState.ruleType === 'no-repeat') {
      return { type: 'no-repeat' as const, component_type: formState.component_type };
    }

    if (formState.ruleType === 'scheduling-rule') {
      const { match, effect } = formState;
      if (effect === '' || match.mode === '') return null;

      if (match.mode === 'tag') {
        const { filter } = match;
        const matchCount = allComponents.filter(c => {
          const dietaryOk = !filter.dietary_tag || c.dietary_tags.includes(filter.dietary_tag);
          const proteinOk = !filter.protein_tag || c.protein_tag === filter.protein_tag;
          const regionalOk = !filter.regional_tag || c.regional_tags.includes(filter.regional_tag);
          const occasionOk = !filter.occasion_tag || c.occasion_tags.includes(filter.occasion_tag);
          return dietaryOk && proteinOk && regionalOk && occasionOk;
        }).length;
        return { type: 'scheduling-rule-tag' as const, matchCount, total: allComponents.length };
      }

      if (match.mode === 'component') {
        if (match.component_id === null) return null;
        const componentName = allComponents.find(c => c.id === match.component_id)?.name ?? 'Unknown';
        return { type: 'scheduling-rule-component' as const, componentName };
      }
    }

    return null;
  }, [allComponents, formState]);

  if (!impact) return null;

  return (
    <div className="space-y-3">
      {impact.type === 'no-repeat' && impact.component_type && (
        <p className="text-sm text-muted-foreground">
          Ensures no {impact.component_type} repeats within the week.
        </p>
      )}

      {impact.type === 'scheduling-rule-tag' && (
        <>
          <p className="text-sm text-muted-foreground">
            This rule affects {impact.matchCount} of {impact.total} components.
          </p>
          {impact.matchCount === 0 && (
            <Alert className="border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700">
              <TriangleAlertIcon className="h-4 w-4" />
              <AlertDescription>
                Warning: This rule matches 0 components. The generator will ignore it.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}

      {impact.type === 'scheduling-rule-component' && (
        <p className="text-sm text-muted-foreground">
          This rule applies to {impact.componentName}.
        </p>
      )}
    </div>
  );
}
