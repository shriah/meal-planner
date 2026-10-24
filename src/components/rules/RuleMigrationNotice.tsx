'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { X } from 'lucide-react'
import { db, RULE_MIGRATION_NOTICE_ID } from '@/db/client'

/** Shown once after the rule system upgrade if some old rules could not be converted. */
export function RuleMigrationNotice() {
  const notice = useLiveQuery(() => db.notices.get(RULE_MIGRATION_NOTICE_ID))
  if (!notice || notice.dismissed || notice.dropped.length === 0) return null

  const dismiss = () => db.notices.update(RULE_MIGRATION_NOTICE_ID, { dismissed: true })

  return (
    <div role="status" className="mb-4 flex items-start gap-3 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
      <div className="flex-1 space-y-2">
        <p className="font-medium">Rules were upgraded to the new planner</p>
        <p className="text-muted-foreground">
          {notice.converted} rules were converted. These old rules could not be converted faithfully and were removed:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {notice.dropped.map((rule) => (
            <li key={rule.id}><span className="font-medium">{rule.name}</span> — {rule.reason}</li>
          ))}
        </ul>
      </div>
      <button onClick={dismiss} className="shrink-0 p-1 hover:bg-muted rounded" aria-label="Dismiss rule upgrade notice">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
