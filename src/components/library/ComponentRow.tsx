'use client'

import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { buildCategoryMap, getBaseCategoryLabel, getExtraCategoryLabel } from '@/lib/category-labels'
import { getCategoriesByKind } from '@/services/category-db'
import { getOwnedRules } from '@/services/food-db'
import { clashCurryCategories, pairingCategories, ruleDays, type RuleRecord } from '@/rules'
import { ComponentForm } from './ComponentForm'
import { DeleteConfirmStrip } from './DeleteConfirmStrip'
import type { ComponentRecord } from '@/types/component'

interface ComponentRowProps {
  component: ComponentRecord
  expanded: boolean
  confirmingDelete: boolean
  onExpand: () => void
  onCollapse: () => void
  onRequestDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
}

export function ComponentRow({
  component,
  expanded,
  confirmingDelete,
  onExpand,
  onCollapse,
  onRequestDelete,
  onCancelDelete,
  onDelete,
}: ComponentRowProps) {
  const baseCategories = useLiveQuery(() => getCategoriesByKind('base'), [], undefined)
  const extraCategories = useLiveQuery(() => getCategoriesByKind('extra'), [], undefined)
  const baseCategoriesById = useMemo(() => buildCategoryMap(baseCategories ?? []), [baseCategories])
  const extraCategoriesById = useMemo(() => buildCategoryMap(extraCategories ?? []), [extraCategories])
  const isCurry = component.componentType === 'curry'
  // Compatible bases (curry, subzi), clashing curry types (extra) and specific days live in rules the
  // component owns; without them it goes with anything, on any day.
  const owned = useLiveQuery(() => getOwnedRules(component.id), [component.id])
  const ownedValue = <T,>(read: (r: RuleRecord) => T | undefined): T | undefined =>
    owned?.map(read).find((v) => v !== undefined)
  const pairedBaseCategoryIds = ownedValue(pairingCategories)
  const compatibleBaseLabels = (pairedBaseCategoryIds ?? []).map((id) =>
    getBaseCategoryLabel(baseCategoriesById, id),
  )
  const clashLabels = ownedValue(clashCurryCategories) ?? []
  const days = ownedValue(ruleDays) ?? []
  const dayLabel = days.join() === 'monday,tuesday,wednesday,thursday,friday' ? 'Weekdays'
    : days.join() === 'saturday,sunday' ? 'Weekends'
      : days.length ? `Only ${days.map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ')}` : undefined
  const showsCompatibleBaseSummary = compatibleBaseLabels.length > 0
  const showsNeverAutoWarning = owned?.some((r) => r.spec.template === 'exclude') ?? false

  function handleRowClick() {
    if (expanded) {
      onCollapse()
    } else {
      onExpand()
    }
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation()
    onRequestDelete()
  }

  return (
    <div>
      {/* Collapsed row — 48px min height */}
      <div
        className="flex min-h-[48px] items-center gap-2 px-4 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={handleRowClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleRowClick()
          }
        }}
      >
        {/* Component name */}
        <span className="flex-1 text-sm truncate">{component.name}</span>

        {/* Dietary badges */}
        <div className="flex gap-1 flex-wrap">
          {component.dietary_tags.map(tag => (
            <Badge key={tag} variant="secondary" className="shrink-0 text-sm px-2 py-0.5">
              {tag}
            </Badge>
          ))}
        </div>

        {/* Regional badges */}
        <div className="flex gap-1 flex-wrap">
          {component.regional_tags.map(tag => (
            <Badge key={tag} variant="outline" className="shrink-0 text-sm px-2 py-0.5">
              {tag}
            </Badge>
          ))}
        </div>

        {component.componentType === 'base' && component.base_category_id != null && (
          <Badge variant="secondary" className="shrink-0 text-sm px-2 py-0.5">
            {getBaseCategoryLabel(baseCategoriesById, component.base_category_id)}
          </Badge>
        )}

        {component.componentType === 'extra' && component.extra_category_id != null && (
          <Badge variant="secondary" className="shrink-0 text-sm px-2 py-0.5">
            {getExtraCategoryLabel(extraCategoriesById, component.extra_category_id)}
          </Badge>
        )}

        {isCurry && component.curry_category && (
          <Badge variant="secondary" className="shrink-0 text-sm px-2 py-0.5">
            {component.curry_category}
          </Badge>
        )}

        {dayLabel && (
          <Badge variant="outline" className="shrink-0 text-sm px-2 py-0.5">
            {dayLabel}
          </Badge>
        )}

        {clashLabels.length > 0 && (
          <Badge variant="outline" className="shrink-0 text-sm px-2 py-0.5">
            Not with {clashLabels.join(', ')}
          </Badge>
        )}

        {showsCompatibleBaseSummary && (
          <Badge variant="outline" className="shrink-0 text-sm px-2 py-0.5">
            {compatibleBaseLabels.join(', ')}
          </Badge>
        )}

        {showsNeverAutoWarning && (
          <Badge variant="destructive" className="shrink-0 text-sm px-2 py-0.5">
            Not auto-selected
          </Badge>
        )}

        {/* Delete button with tooltip */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="min-w-[44px] min-h-[44px] shrink-0"
                aria-label={`Delete ${component.name}`}
                onClick={handleDeleteClick}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Delete {component.name}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Delete confirmation strip */}
      {confirmingDelete && (
        <DeleteConfirmStrip
          componentName={component.name}
          componentId={component.id}
          onDeleted={onDelete}
          onCancel={onCancelDelete}
        />
      )}

      {/* Expanded inline editor */}
      {expanded && !confirmingDelete && (
        <div className="px-4 pb-4 border-t border-border">
          <ComponentForm
            component={component}
            componentType={component.componentType}
            mode="edit"
            onSave={onCollapse}
            onDiscard={onCollapse}
          />
        </div>
      )}
    </div>
  )
}
