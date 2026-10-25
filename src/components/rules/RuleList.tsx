'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/client'
import { getRules, restoreDefaultRules } from '@/services/food-db'
import { parseHash, useUrlHash } from '@/lib/hash-target'
import { describeSpec, groupRules, parseSpec, type KnownIds, type Names } from '@/rules'
import type { RuleRecord } from '@/db/client'
import { RuleRow } from './RuleRow'
import { RuleEmptyState } from './RuleEmptyState'
import { RuleMigrationNotice } from './RuleMigrationNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import { Plus } from 'lucide-react'

export function RuleList() {
  const rules = useLiveQuery(getRules)
  const components = useLiveQuery(() => db.components.toArray(), [], [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const [query, setQuery] = useState('')
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null)

  // Names for descriptions, and the ids that exist, so rules pointing at deleted items are flagged.
  const { names, known } = useMemo(() => {
    const componentName = new Map(components.map((c) => [c.id, c.name]))
    const categoryName = new Map(categories.map((c) => [c.id, c.name]))
    const names: Names = {
      component: (id) => componentName.get(id),
      baseCategory: (id) => categoryName.get(id),
      extraCategory: (id) => categoryName.get(id),
    }
    const known: KnownIds = {
      components: new Set(components.map((c) => c.id)),
      baseCategories: new Set(categories.filter((c) => c.kind === 'base').map((c) => c.id)),
      extraCategories: new Set(categories.filter((c) => c.kind === 'extra').map((c) => c.id)),
    }
    return { names, known }
  }, [components, categories])

  const groups = useMemo(() => groupRules(rules ?? []), [rules])

  // A deep link (`/rules#rule-12`) opens the section holding that rule and scrolls to it.
  const target = parseHash(useUrlHash()).rule
  const targetGroup = target === undefined ? undefined
    : (['defaults', 'dish', 'mine'] as const).find((g) => groups[g].some((r) => r.id === target))
  useEffect(() => {
    if (targetGroup) document.getElementById(`rule-${target}`)?.scrollIntoView?.({ block: 'center' })
  }, [target, targetGroup])

  if (!rules) return null

  const needle = query.trim().toLowerCase()
  const searching = needle !== ''
  const matches = (rule: RuleRecord) => {
    if (!searching) return true
    const parsed = parseSpec(rule.spec)
    const text = `${rule.name} ${parsed.ok ? describeSpec(parsed.spec, names) : ''}`.toLowerCase()
    return text.includes(needle)
  }
  const mine = groups.mine.filter(matches)
  const defaults = groups.defaults.filter(matches)
  const dish = groups.dish.filter(matches)
  const nothingMatches = searching && mine.length + defaults.length + dish.length === 0

  const activeCount = rules.filter((r) => r.enabled).length
  const row = (rule: RuleRecord) => <RuleRow key={rule.id} rule={rule} names={names} known={known} highlighted={rule.id === target} />

  async function restore() {
    const added = await restoreDefaultRules()
    setRestoreMessage(added === 0 ? 'All default rules are already there' : `Restored ${added} default ${added === 1 ? 'rule' : 'rules'}`)
  }

  return (
    <main className="px-4 py-8 sm:px-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[28px] font-semibold font-heading">Rules</h1>
        <Button asChild>
          <Link href="/rules/new">
            <Plus className="h-4 w-4 mr-2" />
            Add Rule
          </Link>
        </Button>
      </div>
      <RuleMigrationNotice />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {rules.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {rules.length} rules · {activeCount} active
          </p>
        )}
        <Input
          type="search"
          aria-label="Search rules"
          placeholder="Search rules…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:w-72"
        />
      </div>
      <Separator className="mb-4" />

      {nothingMatches && <p className="py-8 text-sm text-muted-foreground">No rules match “{query.trim()}”</p>}

      {!nothingMatches && (searching ? mine.length > 0 : true) && (
        <section>
          {(mine.length > 0 || searching) && <h2 className="mb-1 text-lg font-semibold font-heading">Your rules</h2>}
          {mine.length > 0 ? mine.map(row) : <RuleEmptyState />}
        </section>
      )}

      {!nothingMatches && (searching ? defaults.length > 0 : true) && (
        <details className="mt-8" open={searching || targetGroup === 'defaults' ? true : undefined}>
          <summary className="cursor-pointer text-lg font-semibold font-heading">Planner defaults ({defaults.length})</summary>
          <div className="mb-2 mt-1 flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              What the planner aims for unless a rule says otherwise. Edit, switch off or delete any of them.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void restore()}>Restore defaults</Button>
            {restoreMessage && <span role="status" className="text-sm text-muted-foreground">{restoreMessage}</span>}
          </div>
          {defaults.map(row)}
        </details>
      )}

      {!nothingMatches && dish.length > 0 && (
        <details className="mt-8" open={searching || targetGroup === 'dish' ? true : undefined}>
          <summary className="cursor-pointer text-lg font-semibold font-heading">Dish settings ({dish.length})</summary>
          <p className="mb-2 mt-1 text-sm text-muted-foreground">
            Which bases, curries and days each dish goes with. Change them from the dish in the Library.
          </p>
          {dish.map(row)}
        </details>
      )}
    </main>
  )
}
