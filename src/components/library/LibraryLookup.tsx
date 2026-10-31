'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getAllComponents, getRules } from '@/services/food-db'
import { getCategoriesByKind } from '@/services/category-db'
import type { Names, RuleRecord } from '@/rules'
import type { ComponentRecord } from '@/types/component'
import type { CategoryRecord } from '@/types/category'

export interface LibraryLookup {
  dishes: ComponentRecord[]
  baseCategories: CategoryRecord[]
  extraCategories: CategoryRecord[]
  /** Every rule: the ones dishes own, and the hand-written ones. Filter by `owner_component_id`. */
  rules: RuleRecord[]
  loaded: boolean
}

const LibraryLookupContext = createContext<LibraryLookup | null>(null)

// `enabled` false skips the queries, so a hook under a provider reads the database only once.
function useLookupQueries(enabled: boolean): LibraryLookup {
  const dishes = useLiveQuery(() => (enabled ? getAllComponents() : []), [enabled], undefined)
  const baseCategories = useLiveQuery(() => (enabled ? getCategoriesByKind('base') : []), [enabled], undefined)
  const extraCategories = useLiveQuery(() => (enabled ? getCategoriesByKind('extra') : []), [enabled], undefined)
  const rules = useLiveQuery(() => (enabled ? getRules() : []), [enabled], undefined)
  return {
    dishes: dishes ?? [],
    baseCategories: baseCategories ?? [],
    extraCategories: extraCategories ?? [],
    rules: rules ?? [],
    loaded: dishes !== undefined && baseCategories !== undefined && extraCategories !== undefined && rules !== undefined,
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

/** Names for describing links, from the lookup. */
export function linkNames(lookup: LibraryLookup): Names {
  const dishes = new Map(lookup.dishes.map((d) => [d.id, d.name]))
  const base = new Map(lookup.baseCategories.map((c) => [c.id, c.name]))
  const extra = new Map(lookup.extraCategories.map((c) => [c.id, c.name]))
  return {
    component: (id) => dishes.get(id),
    baseCategory: (id) => base.get(id),
    extraCategory: (id) => extra.get(id),
  }
}
