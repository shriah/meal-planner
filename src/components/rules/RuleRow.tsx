'use client'

import { useState } from 'react'
import type { RuleRecord } from '@/db/client'
import { describeRule } from './ruleDescriptions'
import { updateRule, deleteRule } from '@/services/food-db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { Alert } from '@/components/ui/alert'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RuleRowProps {
  rule: RuleRecord
}

export function RuleRow({ rule }: RuleRowProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const summary = describeRule(rule.compiled_filter)

  const ruleTypeLabel =
    rule.compiled_filter.type === 'no-repeat'
      ? 'No Repeat'
      : rule.compiled_filter.effect === 'filter-pool'
        ? 'Filter Pool'
        : rule.compiled_filter.effect === 'require-one'
          ? 'Require One'
          : 'Exclude'

  async function handleToggle() {
    await updateRule(rule.id!, { enabled: !rule.enabled })
  }

  async function handleDelete() {
    await deleteRule(rule.id!)
    setConfirmingDelete(false)
  }

  return (
    <div>
      <div
        className={cn(
          'flex min-h-[48px] items-center gap-4 px-4 py-3',
          !rule.enabled && 'text-muted-foreground',
        )}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{rule.name}</p>
          <p className="text-sm text-muted-foreground truncate">{summary}</p>
        </div>
        <Badge variant="secondary" className="text-xs shrink-0">
          {ruleTypeLabel}
        </Badge>
        <button
          type="button"
          role="switch"
          aria-checked={rule.enabled}
          onClick={handleToggle}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
            rule.enabled ? 'bg-primary' : 'bg-input',
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block size-4 rounded-full bg-background shadow transition-transform',
              rule.enabled ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete rule"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete rule</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {confirmingDelete && (
        <Alert
          variant="destructive"
          className="mx-4 mt-1 flex items-center justify-between gap-2"
        >
          <span className="text-xs">Delete this rule? This cannot be undone.</span>
          <div className="flex gap-2 shrink-0">
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-foreground hover:text-foreground"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </Button>
          </div>
        </Alert>
      )}
    </div>
  )
}
