'use client'

import { useState } from 'react'
import type { RuleRecord } from '@/db/client'
import { describeSpec, missingReferences, parseSpec, TEMPLATES, type KnownIds, type Names } from '@/rules'
import { toast } from 'sonner'
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
import { Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { EditRuleSheet } from './EditRuleSheet'

interface RuleRowProps {
  rule: RuleRecord
  names: Names
  known: KnownIds
  /** The row a deep link points at. */
  highlighted?: boolean
}

/** Why a stored rule would be skipped when planning, or null when it applies. */
function problemOf(rule: RuleRecord, known: KnownIds): string | null {
  const parsed = parseSpec(rule.spec)
  if (!parsed.ok) return `Invalid rule — ${parsed.message}`
  const missing = missingReferences(parsed.spec, known)
  return missing.length ? `Refers to ${missing.join(', ')}, which no longer exists` : null
}

export function RuleRow({ rule, names, known, highlighted = false }: RuleRowProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const parsed = parseSpec(rule.spec)
  const summary = parsed.ok ? describeSpec(parsed.spec, names) : 'This rule cannot be read'
  const problem = problemOf(rule, known)
  const owned = rule.owner_component_id !== undefined
  // A deep link to this rule opens its editor once; closing it leaves the row highlighted.
  const [openedForLink, setOpenedForLink] = useState(false)
  if (highlighted && !owned && !openedForLink) {
    setOpenedForLink(true)
    setEditing(true)
  }
  if (!highlighted && openedForLink) setOpenedForLink(false)

  async function handleToggle() {
    await updateRule(rule.id, { enabled: !rule.enabled })
    toast.success(`Rule “${rule.name}” switched ${rule.enabled ? 'off' : 'on'}`)
  }

  async function handleDelete() {
    await deleteRule(rule.id)
    toast.success(`Rule “${rule.name}” deleted`)
    setConfirmingDelete(false)
  }

  return (
    <div
      id={`rule-${rule.id}`}
      data-highlighted={highlighted ? 'true' : undefined}
      className={cn(highlighted && 'rounded-md bg-primary/10 ring-2 ring-primary')}
    >
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
        {problem ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="destructive" className="text-xs shrink-0">Not applied</Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{problem}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : parsed.ok && (
          <Badge variant="secondary" className="text-xs shrink-0">{TEMPLATES[parsed.spec.template].label}</Badge>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={rule.enabled}
          aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.name}`}
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
        {owned ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/library#dish-${rule.owner_component_id}`}>Edit in Library</Link>
          </Button>
        ) : (
          <>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Edit rule" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit rule</TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
          </>
        )}
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
              Keep rule
            </Button>
          </div>
        </Alert>
      )}
      {!owned && <EditRuleSheet rule={rule} open={editing} onOpenChange={setEditing} />}
    </div>
  )
}
