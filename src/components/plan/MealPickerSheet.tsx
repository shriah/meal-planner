'use client'

import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { getComponentsByType, getExtrasByBaseType } from '@/services/food-db'
import { filterComponents } from '@/lib/filter-components'
import { usePlanStore } from '@/stores/plan-store'
import type { DayOfWeek } from '@/types/plan'
import type { MealSlot } from '@/types/preferences'
import type { ComponentType, DietaryTag, RegionalTag, BaseType } from '@/types/component'

const ALL_DIETARY_TAGS: DietaryTag[] = ['veg', 'non-veg', 'vegan', 'jain', 'eggetarian']
const ALL_REGIONAL_TAGS: RegionalTag[] = ['south-indian', 'north-indian', 'coastal-konkan', 'pan-indian']

const COMPONENT_TYPE_MAP: Record<'base' | 'curry' | 'subzi' | 'extras', ComponentType> = {
  base: 'base',
  curry: 'curry',
  subzi: 'subzi',
  extras: 'extra',  // 'extras' lock key maps to 'extra' ComponentType
}

const PICKER_TITLES: Record<'base' | 'curry' | 'subzi' | 'extras', string> = {
  base: 'Pick Base',
  curry: 'Pick Curry',
  subzi: 'Pick Subzi',
  extras: 'Pick Extras',
}

interface MealPickerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  day: DayOfWeek
  slot: MealSlot
  componentType: 'base' | 'curry' | 'subzi' | 'extras'
  currentBaseType?: BaseType  // For extras filtering by compatible base type
}

export function MealPickerSheet({ open, onOpenChange, day, slot, componentType, currentBaseType }: MealPickerSheetProps) {
  const [searchText, setSearchText] = useState('')
  const [activeDietaryTags, setActiveDietaryTags] = useState<DietaryTag[]>([])
  const [activeRegionalTags, setActiveRegionalTags] = useState<RegionalTag[]>([])
  const swapComponent = usePlanStore(s => s.swapComponent)

  const dbComponentType = COMPONENT_TYPE_MAP[componentType]

  // For extras, filter by compatible base type. For others, get all of that type.
  const components = useLiveQuery(
    () => {
      if (componentType === 'extras' && currentBaseType) {
        return getExtrasByBaseType(currentBaseType)
      }
      return getComponentsByType(dbComponentType)
    },
    [dbComponentType, componentType, currentBaseType],
    [],
  )

  const filtered = useMemo(
    () => filterComponents(components ?? [], searchText, activeDietaryTags, activeRegionalTags),
    [components, searchText, activeDietaryTags, activeRegionalTags],
  )

  function toggleDietaryTag(tag: DietaryTag) {
    setActiveDietaryTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  function toggleRegionalTag(tag: RegionalTag) {
    setActiveRegionalTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  function handleSelect(componentId: number) {
    swapComponent(day, slot, componentType, componentId)
    // Reset filters and close
    setSearchText('')
    setActiveDietaryTags([])
    setActiveRegionalTags([])
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[70vh] flex flex-col">
        <SheetHeader>
          <SheetTitle>{PICKER_TITLES[componentType]}</SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-2 space-y-3">
          {/* Search */}
          <Input
            placeholder={`Search ${dbComponentType}s...`}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="h-9"
          />

          {/* Dietary tag chips */}
          <div className="flex flex-wrap gap-2">
            {ALL_DIETARY_TAGS.map(tag => (
              <Badge
                key={tag}
                variant={activeDietaryTags.includes(tag) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleDietaryTag(tag)}
              >
                {tag}
              </Badge>
            ))}
          </div>

          {/* Regional tag chips */}
          <div className="flex flex-wrap gap-2">
            {ALL_REGIONAL_TAGS.map(tag => (
              <Badge
                key={tag}
                variant={activeRegionalTags.includes(tag) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleRegionalTag(tag)}
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* Component list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No {dbComponentType}s match your filters. Try clearing a tag.
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleSelect(c.id!)}
                  className="w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent/10 transition-colors"
                >
                  <span className="font-medium">{c.name}</span>
                  <div className="flex gap-1 shrink-0">
                    {c.dietary_tags.map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {c.regional_tags.map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
