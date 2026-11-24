'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getAllComponents, getRules } from '@/services/food-db'
import { getAllCategories, getCategoriesByKind } from '@/services/category-db'
import { getParts } from '@/services/parts-db'
import { cappedParts, libraryNames, type Names, type RuleRecord } from '@/rules'
import { hasConvertedParts, legacyPartIds } from '@/db/parts'
import type { ComponentRecord } from '@/types/component'
import type { CategoryRecord } from '@/types/category'
import type { PartRecord } from '@/types/part'

export interface LibraryLookup {
  dishes: ComponentRecord[]
  baseCategories: CategoryRecord[]
  extraCategories: CategoryRecord[]
  /** Every category, of every part (the Curry part's curry types too). */
  categories: CategoryRecord[]
  /** Every rule: the ones dishes own, and the hand-written ones. Filter by `owner_component_id`. */
  rules: RuleRecord[]
  /** The meal's parts, in meal order. */
  parts: PartRecord[]
  loaded: boolean
}

const LibraryLookupContext = createContext<LibraryLookup | null>(null)

// `enabled` false skips the queries, so a hook under a provider reads the database only once.
function useLookupQueries(enabled: boolean): LibraryLookup {
  const dishes = useLiveQuery(() => (enabled ? getAllComponents() : []), [enabled], undefined)
  const baseCategories = useLiveQuery(() => (enabled ? getCategoriesByKind('base') : []), [enabled], undefined)
  const extraCategories = useLiveQuery(() => (enabled ? getCategoriesByKind('extra') : []), [enabled], undefined)
  const categories = useLiveQuery(() => (enabled ? getAllCategories() : []), [enabled], undefined)
  const rules = useLiveQuery(() => (enabled ? getRules() : []), [enabled], undefined)
  const parts = useLiveQuery(() => (enabled ? getParts() : []), [enabled], undefined)
  return {
    dishes: dishes ?? [],
    baseCategories: baseCategories ?? [],
    extraCategories: extraCategories ?? [],
    categories: categories ?? [],
    rules: rules ?? [],
    parts: parts ?? [],
    loaded: dishes !== undefined && baseCategories !== undefined && extraCategories !== undefined && categories !== undefined
      && rules !== undefined && parts !== undefined,
  }
}

export function LibraryLookupProvider({ children }: { children: ReactNode }) {
  const lookup = useLookupQueries(true)
  return <LibraryLookupContext.Provider value={lookup}>{children}</LibraryLookupContext.Provider>
}

/** Hands a lookup already in hand to the components below, so they do not each run their own queries. */
export function ShareLibraryLookup({ value, children }: { value: LibraryLookup; children: ReactNode }) {
  return <LibraryLookupContext.Provider value={value}>{children}</LibraryLookupContext.Provider>
}

/** The shared lookup; outside a provider (a form opened on its own) it runs its own live queries. */
export function useLibraryLookup(): LibraryLookup {
  const shared = useContext(LibraryLookupContext)
  const own = useLookupQueries(shared === null)
  return shared ?? own
}

/** Names for describing links, from the lookup: dishes, every category (curry types read before the noun) and the parts in meal order. */
export function linkNames(lookup: LibraryLookup): Names {
  return libraryNames({ dishes: lookup.dishes, categories: lookup.categories, parts: lookup.parts })
}

/** The part a dish is in: its own `part_id`, or for a dish saved without one, the converted part of its type. */
export function dishPart(lookup: Pick<LibraryLookup, 'parts'>, dish: Pick<ComponentRecord, 'part_id' | 'componentType'>): number | undefined {
  return dish.part_id ?? lookup.parts.find((p) => p.legacy === dish.componentType)?.id
}

/** The part a dish's links are made from: the stored dish's part, or for a new dish, the part of its type. Undefined until the parts have loaded. */
export function ownerPartOf(lookup: Pick<LibraryLookup, 'parts' | 'dishes'>, componentType: ComponentRecord['componentType'], selfId?: number): number | undefined {
  const stored = selfId === undefined ? undefined : lookup.dishes.find((d) => d.id === selfId)
  return dishPart(lookup, stored ?? { componentType })
}

/**
 * The parts the stored rules cap at one dish per meal (on a converted library, the Curry and Subzi caps), read from the
 * lookup's parts and rules as the planner reads them. A dish is offered links to its own part only where two may meet.
 */
export function cappedOf(lookup: Pick<LibraryLookup, 'parts' | 'rules'>): Set<number> {
  return cappedParts(lookup.rules, { list: lookup.parts, ...(hasConvertedParts(lookup.parts) && { legacy: legacyPartIds(lookup.parts) }) })
}
