'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { TriangleAlert as TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getAllComponents } from '@/services/food-db';
import type { RuleFormState } from './types';

interface RuleImpactPreviewProps {
  formState: RuleFormState;
}

export function RuleImpactPreview({ formState }: RuleImpactPreviewProps) {
  const allComponents = useLiveQuery(() => getAllComponents()) ?? [];

  const impact = useMemo(() => {
    const target = formState.target;
    if (target.mode === '') return null;

    if (target.mode === 'component_type') {
      const count = allComponents.filter(c => c.componentType === target.component_type).length;
      return { type: 'count' as const, count, label: `${target.component_type}s` };
    }

    if (target.mode === 'tag') {
      const f = target.filter;
      const matchCount = allComponents.filter(c => {
        const dietaryOk = !f.dietary_tag  || c.dietary_tags.includes(f.dietary_tag);
        const proteinOk = !f.protein_tag  || c.protein_tag === f.protein_tag;
        const regionalOk = !f.regional_tag || c.regional_tags.includes(f.regional_tag);
        const occasionOk = !f.occasion_tag || c.occasion_tags.includes(f.occasion_tag);
        return dietaryOk && proteinOk && regionalOk && occasionOk;
      }).length;
      return { type: 'tag_count' as const, matchCount, total: allComponents.length };
    }

    if (target.mode === 'component') {
      if (target.component_id === null) return null;
      const name = allComponents.find(c => c.id === target.component_id)?.name ?? 'Unknown';
      return { type: 'component' as const, name };
    }

    if (target.mode === 'base_type') {
      const count = allComponents.filter(
        c => c.componentType === 'base' && c.base_type === target.base_type,
      ).length;
      return { type: 'base_type' as const, count, base_type: target.base_type };
    }

    return null;
  }, [allComponents, formState]);

  if (!impact) return null;

  return (
    <div className="space-y-3">
      {impact.type === 'count' && (
        <p className="text-sm text-muted-foreground">
          This rule targets {impact.count} {impact.label}.
        </p>
      )}
      {impact.type === 'tag_count' && (
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
      {impact.type === 'component' && (
        <p className="text-sm text-muted-foreground">This rule applies to {impact.name}.</p>
      )}
      {impact.type === 'base_type' && (
        <p className="text-sm text-muted-foreground">
          This rule applies to {impact.count} {impact.base_type} bases.
        </p>
      )}
    </div>
  );
}
