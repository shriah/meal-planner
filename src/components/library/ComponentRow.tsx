'use client'

import { useMemo } from 'react'
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
import { describeDays, describeMeals, isDishTarget, linkSlotOf, readOwned } from '@/rules'
import { ComponentForm } from './ComponentForm'
import { useLibraryLookup } from './LibraryLookup'
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
  const lookup = useLibraryLookup()
  const baseCategoriesById = useMemo(() => buildCategoryMap(lookup.baseCategories), [lookup.baseCategories])
  const extraCategoriesById = useMemo(() => buildCategoryMap(lookup.extraCategories), [lookup.extraCategories])
  const isCurry = component.componentType === 'curry'
  // Compatible bases (curry, subzi), clashing curry types (extra) and specific days live in rules the
  // component owns; without them it goes with anything, on any day.
  const dishNames = useMemo(() => new Map(lookup.dishes.map((d) => [d.id, d.name])), [lookup.dishes])
  const ownedRules = useMemo(() => lookup.rules.filter((r) => r.owner_component_id === component.id), [lookup.rules, component.id])
  const owned = readOwned(ownedRules)
  // One badge per link: bare base names for a goes-with link to base categories (the usual pairing), else "Only with" / "Not with".
  const linkBadges = owned.links.flatMap((link) => {
    const { mode, target, values, strength } = link
    if (values.length === 0) return []
    const names = values.map((v) =>
      target === 'base_category' ? getBaseCategoryLabel(baseCategoriesById, Number(v))
        : target === 'extra_category' ? getExtraCategoryLabel(extraCategoriesById, Number(v))
        : isDishTarget(target) ? (dishNames.get(Number(v)) ?? 'Deleted dish')
        : String(v))
    const soft = { always: '', usually: 'Usually ', moderately: 'Moderately ', sometimes: 'Sometimes ' }[strength]
    const prefix = mode === 'never' ? 'not with ' : target === 'base_category' && !soft ? '' : 'only with '
    const text = soft ? soft + prefix + names.join(', ') : (prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : '') + names.join(', ')
    return [{ key: linkSlotOf(link), text }]
  })
  const dayLabel = describeDays(owned.days)
  const mealLabel = describeMeals(owned.meals)
  const showsNeverAutoWarning = owned.neverAuto

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
    <div id={`dish-${component.id}`}>
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

        {(component.frequency === 'frequent' || component.frequency === 'rare') && (
          <Badge variant="outline" className="shrink-0 text-sm px-2 py-0.5">
            {component.frequency === 'frequent' ? 'Frequent' : 'Rare'}
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

        {mealLabel && (
          <Badge variant="outline" className="shrink-0 text-sm px-2 py-0.5">
            {mealLabel}
          </Badge>
        )}

        {linkBadges.map((badge) => (
          <Badge key={badge.key} variant="outline" className="shrink-0 text-sm px-2 py-0.5">
            {badge.text}
          </Badge>
        ))}

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
