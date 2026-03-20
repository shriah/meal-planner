'use client'

import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getComponentsByType } from '@/services/food-db'
import { filterComponents } from '@/lib/filter-components'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ComponentRow } from './ComponentRow'
import { ComponentForm } from './ComponentForm'
import type { ComponentType, DietaryTag, RegionalTag } from '@/types/component'

const ALL_DIETARY_TAGS: DietaryTag[] = ['veg', 'non-veg', 'vegan', 'jain', 'eggetarian']
const ALL_REGIONAL_TAGS: RegionalTag[] = ['south-indian', 'north-indian', 'coastal-konkan', 'pan-indian']

const SINGULAR_LABEL: Record<ComponentType, string> = {
  base: 'Base',
  curry: 'Curry',
  subzi: 'Subzi',
  extra: 'Extra',
}

interface ComponentTabProps {
  type: ComponentType
  label: string
}

export function ComponentTab({ type, label }: ComponentTabProps) {
  const [searchText, setSearchText] = useState('')
  const [activeDietaryTags, setActiveDietaryTags] = useState<DietaryTag[]>([])
  const [activeRegionalTags, setActiveRegionalTags] = useState<RegionalTag[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [addingNew, setAddingNew] = useState(false)

  const components = useLiveQuery(() => getComponentsByType(type), [type], [])

  const filtered = useMemo(
    () => filterComponents(components ?? [], searchText, activeDietaryTags, activeRegionalTags),
    [components, searchText, activeDietaryTags, activeRegionalTags],
  )

  function toggleDietaryTag(tag: DietaryTag) {
    setActiveDietaryTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    )
  }

  function toggleRegionalTag(tag: RegionalTag) {
    setActiveRegionalTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    )
  }

  // Determine which tags have any matching components in the filtered list
  // (for disabled state — only consider the OTHER active filters, not the tag itself)
  function dietaryTagHasMatches(tag: DietaryTag): boolean {
    if (activeDietaryTags.includes(tag)) return true
    return filterComponents(components ?? [], searchText, [...activeDietaryTags, tag], activeRegionalTags).length > 0
  }

  function regionalTagHasMatches(tag: RegionalTag): boolean {
    if (activeRegionalTags.includes(tag)) return true
    return filterComponents(components ?? [], searchText, activeDietaryTags, [...activeRegionalTags, tag]).length > 0
  }

  const singularLabel = SINGULAR_LABEL[type]
  const isEmpty = (components ?? []).length === 0
  const noResults = !isEmpty && filtered.length === 0

  return (
    <div className="mt-4 space-y-3">
      {/* Search input */}
      <Input
        type="search"
        placeholder={`Search ${label}...`}
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        className="w-full"
      />

      {/* Tag filter chips */}
      <div className="flex flex-wrap gap-2">
        {ALL_DIETARY_TAGS.map(tag => {
          const isActive = activeDietaryTags.includes(tag)
          const hasMatches = dietaryTagHasMatches(tag)
          return (
            <Badge
              key={tag}
              variant={isActive ? 'default' : 'outline'}
              className={
                !hasMatches && !isActive
                  ? 'opacity-50 pointer-events-none cursor-not-allowed'
                  : 'cursor-pointer'
              }
              onClick={() => hasMatches || isActive ? toggleDietaryTag(tag) : undefined}
            >
              {tag}
            </Badge>
          )
        })}
        {ALL_REGIONAL_TAGS.map(tag => {
          const isActive = activeRegionalTags.includes(tag)
          const hasMatches = regionalTagHasMatches(tag)
          return (
            <Badge
              key={tag}
              variant={isActive ? 'default' : 'outline'}
              className={
                !hasMatches && !isActive
                  ? 'opacity-50 pointer-events-none cursor-not-allowed'
                  : 'cursor-pointer'
              }
              onClick={() => hasMatches || isActive ? toggleRegionalTag(tag) : undefined}
            >
              {tag}
            </Badge>
          )
        })}
      </div>

      {/* Empty state: no components at all */}
      {isEmpty && (
        <div className="py-12 text-center space-y-2">
          <p className="text-sm font-semibold">No {label.toLowerCase()} yet</p>
          <p className="text-xs text-muted-foreground">
            Add your first {type} to start building your ingredient library.
          </p>
        </div>
      )}

      {/* Empty state: no search results */}
      {noResults && (
        <div className="py-12 text-center space-y-2">
          <p className="text-sm font-semibold">Nothing matches those filters</p>
          <p className="text-xs text-muted-foreground">
            Try a different name or clear your filters.
          </p>
        </div>
      )}

      {/* Component list */}
      {!isEmpty && filtered.length > 0 && (
        <div className="rounded-md border border-border overflow-hidden">
          {filtered.map((item, idx) => (
            <div key={item.id}>
              {idx > 0 && <Separator />}
              <ComponentRow
                component={item}
                expanded={item.id === expandedId}
                onExpand={() => setExpandedId(item.id ?? null)}
                onCollapse={() => setExpandedId(null)}
                onDelete={() => {
                  // DeleteConfirmStrip is handled inside ComponentRow
                  if (expandedId === item.id) setExpandedId(null)
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Add new inline form */}
      {addingNew && (
        <div className="rounded-md border border-border p-4 mt-2">
          <ComponentForm
            componentType={type}
            mode="add"
            onSave={() => setAddingNew(false)}
            onDiscard={() => setAddingNew(false)}
          />
        </div>
      )}

      {/* Add button */}
      <div className="pt-2">
        <Button
          variant="default"
          onClick={() => {
            setAddingNew(true)
            setExpandedId(null)
          }}
          disabled={addingNew}
        >
          + Add {singularLabel}
        </Button>
      </div>
    </div>
  )
}
