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
  const compatibleBaseLabels = (component.compatible_base_category_ids ?? []).map((id) =>
    getBaseCategoryLabel(baseCategoriesById, id),
  )

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

        {component.componentType === 'extra' && compatibleBaseLabels.length > 0 && (
          <Badge variant="outline" className="shrink-0 text-sm px-2 py-0.5">
            {compatibleBaseLabels.join(', ')}
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
      {confirmingDelete && component.id !== undefined && (
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
