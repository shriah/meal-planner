'use client'

import { useEffect, useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getComponentsByType, getRules } from '@/services/food-db'
import { allowedMealsOf } from '@/rules'
import { MEALS, type Meal } from '@/planner'
import { filterComponents } from '@/lib/filter-components'
import { Input } from '@/components/ui/input'
import { TagFilter } from '@/components/ui/TagFilter'
import { Pagination } from '@/components/ui/Pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ComponentRow } from './ComponentRow'
import { ComponentForm } from './ComponentForm'
import type { ComponentType, DietaryTag, RegionalTag } from '@/types/component'

/** Dishes shown per page. */
export const PAGE_SIZE = 25

const SINGULAR_LABEL: Record<ComponentType, string> = {
  base: 'Base',
  curry: 'Curry',
  subzi: 'Subzi',
  extra: 'Extra',
}

interface ComponentTabProps {
  type: ComponentType
  label: string
  /** A dish to open and scroll to, from a deep link (`/library#dish-3`). */
  focusId?: number
}

export function ComponentTab({ type, label, focusId }: ComponentTabProps) {
  const [searchText, setSearchText] = useState('')
  const [activeDietaryTags, setActiveDietaryTags] = useState<DietaryTag[]>([])
  const [activeRegionalTags, setActiveRegionalTags] = useState<RegionalTag[]>([])
  const [activeMeal, setActiveMeal] = useState<Meal | null>(null)
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<number | null>(focusId ?? null)
  // A deep link that arrives while this tab is open expands its dish too.
  const [seenFocusId, setSeenFocusId] = useState(focusId)
  if (focusId !== seenFocusId) {
    setSeenFocusId(focusId)
    if (focusId !== undefined) setExpandedId(focusId)
  }
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null)
  const [addingNew, setAddingNew] = useState(false)

  const components = useLiveQuery(() => getComponentsByType(type), [type], [])

  const rules = useLiveQuery(getRules, [], [])

  const filtered = useMemo(() => {
    const byTags = filterComponents(components ?? [], searchText, activeDietaryTags, activeRegionalTags)
    return type === 'base' && activeMeal ? byTags.filter(c => allowedMealsOf(c, rules).includes(activeMeal)) : byTags
  }, [type, components, rules, searchText, activeDietaryTags, activeRegionalTags, activeMeal])

  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1)
  const currentPage = Math.min(page, lastPage)
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  function toggleDietaryTag(tag: DietaryTag) {
    setPage(0)
    setActiveDietaryTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    )
  }

  function toggleRegionalTag(tag: RegionalTag) {
    setPage(0)
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

  const hasFocusedDish = focusId !== undefined && (components ?? []).some(c => c.id === focusId)
  // A deep link shows the page its dish is on, then scrolls to it.
  const focusPage = hasFocusedDish ? Math.floor(filtered.findIndex(c => c.id === focusId) / PAGE_SIZE) : -1
  const [jumpedTo, setJumpedTo] = useState<number | undefined>()
  if (focusPage >= 0 && jumpedTo !== focusId) {
    setJumpedTo(focusId)
    setPage(focusPage)
  }
  const focusVisible = visible.some(c => c.id === focusId)
  useEffect(() => {
    if (focusVisible) document.getElementById(`dish-${focusId}`)?.scrollIntoView?.({ block: 'center' })
  }, [focusVisible, focusId])

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
        onChange={e => { setSearchText(e.target.value); setPage(0) }}
        className="w-full"
      />

      {/* Tag filter chips */}
      <TagFilter
        dietary={activeDietaryTags}
        regional={activeRegionalTags}
        onToggleDietary={toggleDietaryTag}
        onToggleRegional={toggleRegionalTag}
        isDisabled={(kind, tag) => kind === 'dietary'
          ? !dietaryTagHasMatches(tag as DietaryTag)
          : !regionalTagHasMatches(tag as RegionalTag)}
      />

      {/* Meal filter (bases only): dishes that may be planned at the chosen meal */}
      {type === 'base' && <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Meal">
        <span className="text-xs font-semibold">Meal</span>
        {MEALS.map(meal => (
          <Badge key={meal} asChild variant={activeMeal === meal ? 'default' : 'outline'} className="cursor-pointer text-sm px-2 py-0.5">
            <button
              type="button"
              aria-pressed={activeMeal === meal}
              onClick={() => { setActiveMeal(activeMeal === meal ? null : meal); setPage(0) }}
            >
              {meal}
            </button>
          </Badge>
        ))}
      </div>}

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
          {visible.map((item, idx) => (
            <div key={item.id}>
              {idx > 0 && <Separator />}
              <ComponentRow
                component={item}
                expanded={item.id === expandedId}
                confirmingDelete={item.id === confirmingDeleteId}
                onExpand={() => setExpandedId(item.id)}
                onCollapse={() => setExpandedId(null)}
                onRequestDelete={() => setConfirmingDeleteId(item.id)}
                onCancelDelete={() => setConfirmingDeleteId(null)}
                onDelete={() => {
                  setConfirmingDeleteId(null)
                  if (expandedId === item.id) setExpandedId(null)
                }}
              />
            </div>
          ))}
        </div>
      )}

      <Pagination page={currentPage} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />

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
