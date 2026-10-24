'use client'

import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/client'
import { getRules } from '@/services/food-db'
import type { KnownIds, Names } from '@/rules'
import { RuleRow } from './RuleRow'
import { RuleEmptyState } from './RuleEmptyState'
import { RuleMigrationNotice } from './RuleMigrationNotice'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import { Plus } from 'lucide-react'

export function RuleList() {
  const rules = useLiveQuery(getRules)
  const components = useLiveQuery(() => db.components.toArray(), [], [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])

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

  if (!rules) return null

  const activeCount = rules.filter((r) => r.enabled).length

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
      {rules.length > 0 && (
        <p className="text-sm text-muted-foreground mb-4">
          {rules.length} rules · {activeCount} active
        </p>
      )}
      <Separator className="mb-4" />
      {rules.length === 0 ? (
        <RuleEmptyState />
      ) : (
        rules.map((rule) => <RuleRow key={rule.id} rule={rule} names={names} known={known} />)
      )}
    </main>
  )
}
