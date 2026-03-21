'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { getRules } from '@/services/food-db'
import { RuleRow } from './RuleRow'
import { RuleEmptyState } from './RuleEmptyState'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import { Plus } from 'lucide-react'

export function RuleList() {
  const rules = useLiveQuery(getRules)

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
      {rules.length > 0 && (
        <p className="text-sm text-muted-foreground mb-4">
          {rules.length} rules · {activeCount} active
        </p>
      )}
      <Separator className="mb-4" />
      {rules.length === 0 ? (
        <RuleEmptyState />
      ) : (
        rules.map((rule) => <RuleRow key={rule.id} rule={rule} />)
      )}
    </main>
  )
}
